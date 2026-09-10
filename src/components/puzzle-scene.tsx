"use client";

import { RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type Point3 = readonly [number, number, number];
type Cell = readonly [number, number];
type GridCell = { row: number; column: number };
type GameState = "MENU" | "ANIMATING" | "PLAYING";
type GridMatrix = Array<Array<string | null>>;
type CaptureTarget = {
  setPointerCapture: (pointerId: number) => void;
  hasPointerCapture: (pointerId: number) => boolean;
  releasePointerCapture: (pointerId: number) => void;
};

type PieceDefinition = {
  id: string;
  color: string;
  cells: readonly Cell[];
  solvedAnchor: GridCell;
  solvedRotation: number;
  trayPosition: Point3;
  trayRotation: number;
};

const COLUMNS = 11;
const ROWS = 5;
const CELL_SIZE = 0.78;
const SOCKET_Y = 0.27;
const REST_Y = 0.48;
const PLACED_Y = 0.43;
const LIFT_Y = 0.95;
const BOARD_WIDTH = 9.55;
const BOARD_DEPTH = 4.9;
const BOARD_MIN_X = -((COLUMNS - 1) * CELL_SIZE) / 2;
const BOARD_MIN_Z = -((ROWS - 1) * CELL_SIZE) / 2;
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LIFT_Y);
const MENU_FOCUS = new THREE.Vector3(0, 0.08, 0);
const PLAY_FOCUS = new THREE.Vector3(0, 0.08, 6.8);
const CLOSED_LID_ANGLE = Math.PI;
const OPEN_LID_ANGLE = 0;

const PIECES: readonly PieceDefinition[] = [
  { id: "A", color: "#e9232e", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], solvedAnchor: { column: 3, row: 4 }, solvedRotation: 2, trayPosition: [-7.2, REST_Y, 5], trayRotation: 0 },
  { id: "B", color: "#ee9b22", cells: [[0, 0], [1, 0], [2, 0], [1, -1], [0, 1]], solvedAnchor: { column: 5, row: 2 }, solvedRotation: 3, trayPosition: [-7.2, REST_Y, 9], trayRotation: 0 },
  { id: "C", color: "#ffd41f", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]], solvedAnchor: { column: 9, row: 4 }, solvedRotation: 2, trayPosition: [-2.6, REST_Y, 5], trayRotation: 0 },
  { id: "D", color: "#a9d532", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]], solvedAnchor: { column: 1, row: 3 }, solvedRotation: 1, trayPosition: [-7.2, REST_Y, 13], trayRotation: 0 },
  { id: "E", color: "#00a98f", cells: [[0, 0], [1, 0], [2, 0], [1, 1]], solvedAnchor: { column: 8, row: 0 }, solvedRotation: 0, trayPosition: [7.1, REST_Y, 9], trayRotation: 0 },
  { id: "F", color: "#91ddd1", cells: [[0, 0], [1, 0], [2, 0], [1, 1], [2, 1]], solvedAnchor: { column: 5, row: 1 }, solvedRotation: 2, trayPosition: [2.6, REST_Y, 9], trayRotation: 0 },
  { id: "G", color: "#69cff0", cells: [[0, 0], [1, 0], [1, -1]], solvedAnchor: { column: 10, row: 4 }, solvedRotation: 1, trayPosition: [7.1, REST_Y, 5], trayRotation: 0 },
  { id: "H", color: "#0a9bd8", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]], solvedAnchor: { column: 0, row: 0 }, solvedRotation: 0, trayPosition: [-2.6, REST_Y, 13], trayRotation: 0 },
  { id: "I", color: "#1d58a5", cells: [[0, 0], [1, 0], [2, 0], [2, -1]], solvedAnchor: { column: 8, row: 2 }, solvedRotation: 0, trayPosition: [2.6, REST_Y, 13], trayRotation: 0 },
  { id: "J", color: "#6f258e", cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], solvedAnchor: { column: 2, row: 2 }, solvedRotation: 0, trayPosition: [7.1, REST_Y, 13], trayRotation: 0 },
  { id: "K", color: "#b6162d", cells: [[1, 0], [2, 0], [0, 1], [1, 1]], solvedAnchor: { column: 6, row: 3 }, solvedRotation: 1, trayPosition: [-2.6, REST_Y, 9], trayRotation: 0 },
  { id: "L", color: "#e85ba8", cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]], solvedAnchor: { column: 8, row: 1 }, solvedRotation: 2, trayPosition: [2.6, REST_Y, 5], trayRotation: 0 },
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const emptyGrid = (): GridMatrix => Array.from({ length: ROWS }, () => Array<string | null>(COLUMNS).fill(null));

function rotateCell([x, z]: Cell, steps: number): Cell {
  let nextX = x;
  let nextZ = z;
  for (let index = 0; index < steps % 4; index += 1) [nextX, nextZ] = [nextZ, -nextX];
  return [nextX, nextZ];
}

function cellsForPlacement(anchor: GridCell, cells: readonly Cell[], rotation: number, flipped = false): GridCell[] {
  return cells.map((cell) => {
    const mirrored: Cell = [flipped ? -cell[0] : cell[0], cell[1]];
    const [x, z] = rotateCell(mirrored, rotation);
    return { column: anchor.column + x, row: anchor.row + z };
  });
}

function worldToAnchor(x: number, z: number): GridCell {
  return {
    column: Math.round((x - BOARD_MIN_X) / CELL_SIZE),
    row: Math.round((z - BOARD_MIN_Z) / CELL_SIZE),
  };
}

function anchorToWorld(anchor: GridCell): THREE.Vector3 {
  return new THREE.Vector3(BOARD_MIN_X + anchor.column * CELL_SIZE, PLACED_Y, BOARD_MIN_Z + anchor.row * CELL_SIZE);
}

function storageBoundsFor([x, , z]: Point3) {
  const horizontal = x < -5.1
    ? { minX: -10.7, maxX: -5.25 }
    : x < 0
      ? { minX: -5.1, maxX: 0.15 }
      : x < 5.5
        ? { minX: 0.45, maxX: 5.3 }
        : { minX: 5.45, maxX: 10.7 };
  const vertical = z < 7
    ? { minZ: 3.6, maxZ: 7 }
    : z < 11.5
      ? { minZ: 7.3, maxZ: 11.25 }
      : { minZ: 11.55, maxZ: 16.8 };
  return { ...horizontal, ...vertical };
}

function clampPieceToStorageSlot(
  group: THREE.Group,
  definition: PieceDefinition,
  flipped: boolean,
  viewport: { minX: number; maxX: number; minZ: number; maxZ: number },
) {
  group.updateMatrixWorld(true);
  const sphereRadius = 0.375;
  const bounds = definition.cells.reduce((result, [x, z]) => {
    const world = group.localToWorld(new THREE.Vector3((flipped ? -x : x) * CELL_SIZE, 0, z * CELL_SIZE));
    return {
      minX: Math.min(result.minX, world.x - sphereRadius),
      maxX: Math.max(result.maxX, world.x + sphereRadius),
      minZ: Math.min(result.minZ, world.z - sphereRadius),
      maxZ: Math.max(result.maxZ, world.z + sphereRadius),
    };
  }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const storageSlot = storageBoundsFor(definition.trayPosition);
  const slot = {
    minX: Math.max(storageSlot.minX, viewport.minX),
    maxX: Math.min(storageSlot.maxX, viewport.maxX),
    minZ: Math.max(storageSlot.minZ, viewport.minZ),
    maxZ: Math.min(storageSlot.maxZ, viewport.maxZ),
  };
  if (bounds.maxX - bounds.minX > slot.maxX - slot.minX || bounds.maxZ - bounds.minZ > slot.maxZ - slot.minZ) return false;

  let shiftX = 0;
  let shiftZ = 0;
  if (bounds.minX < slot.minX) shiftX = slot.minX - bounds.minX;
  else if (bounds.maxX > slot.maxX) shiftX = slot.maxX - bounds.maxX;
  if (bounds.minZ < slot.minZ) shiftZ = slot.minZ - bounds.minZ;
  else if (bounds.maxZ > slot.maxZ) shiftZ = slot.maxZ - bounds.maxZ;
  group.position.x += shiftX;
  group.position.z += shiftZ;
  return true;
}

function PlasticMaterial({ color }: { color: string }) {
  return <meshPhysicalMaterial color={color} roughness={0.14} metalness={0.01} clearcoat={1} clearcoatRoughness={0.1} />;
}

function Polyomino({
  definition,
  gameState,
  startedAt,
  selected,
  rotationRequest,
  flipRequest,
  onSelect,
  canPlace,
  placePiece,
  clearPiece,
}: {
  definition: PieceDefinition;
  gameState: GameState;
  startedAt: number;
  selected: boolean;
  rotationRequest: number;
  flipRequest: number;
  onSelect: (id: string) => void;
  canPlace: (id: string, cells: GridCell[]) => boolean;
  placePiece: (id: string, cells: GridCell[]) => boolean;
  clearPiece: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const placed = useRef(false);
  const rotation = useRef(definition.trayRotation);
  const flipped = useRef(false);
  const anchor = useRef<GridCell | null>(null);
  const snapAnchor = useRef<GridCell | null>(null);
  const cursorCellIndex = useRef(0);
  const pointerDownPoint = useRef({ x: 0, y: 0 });
  const lastStationaryClick = useRef(0);
  const handledRotationRequest = useRef(rotationRequest);
  const handledFlipRequest = useRef(flipRequest);
  const dragTarget = useRef(new THREE.Vector3(...definition.trayPosition));
  const motionTarget = useRef<THREE.Vector3 | null>(null);
  const solved = useMemo(() => anchorToWorld(definition.solvedAnchor), [definition.solvedAnchor]);
  const tray = useMemo(() => new THREE.Vector3(...definition.trayPosition), [definition.trayPosition]);
  const { camera, invalidate, size } = useThree();

  const currentCells = useCallback((targetAnchor: GridCell, targetRotation = rotation.current, targetFlipped = flipped.current) => (
    cellsForPlacement(targetAnchor, definition.cells, targetRotation, targetFlipped)
  ), [definition.cells]);

  const visibleStorageBounds = useCallback(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const distance = Math.abs(camera.position.y - REST_Y);
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) / 2) * distance;
    const halfWidth = halfHeight * (size.width / Math.max(1, size.height));
    const inset = 0.65;
    return {
      minX: camera.position.x - halfWidth + inset,
      maxX: camera.position.x + halfWidth - inset,
      minZ: PLAY_FOCUS.z - halfHeight + inset,
      maxZ: PLAY_FOCUS.z + halfHeight - inset,
    };
  }, [camera, size.height, size.width]);

  const resetToTray = useCallback(() => {
    const group = groupRef.current;
    dragging.current = false;
    placed.current = false;
    anchor.current = null;
    snapAnchor.current = null;
    rotation.current = definition.trayRotation;
    flipped.current = false;
    if (group) group.rotation.set(0, definition.trayRotation * (Math.PI / 2), 0);
    if (bodyRef.current) bodyRef.current.scale.x = 1;
    motionTarget.current = tray.clone();
    invalidate();
  }, [definition.trayRotation, invalidate, tray]);

  useEffect(() => {
    if (!selected || gameState !== "PLAYING") {
      handledRotationRequest.current = rotationRequest;
      return;
    }
    if (rotationRequest === handledRotationRequest.current || !groupRef.current) return;
    handledRotationRequest.current = rotationRequest;
    const group = groupRef.current;
    const previousRotation = rotation.current;
    const previousPosition = group.position.clone();
    const [pivotX, pivotZ] = definition.cells[cursorCellIndex.current] ?? definition.cells[0];
    const localPivot = new THREE.Vector3((flipped.current ? -pivotX : pivotX) * CELL_SIZE, 0, pivotZ * CELL_SIZE);

    const attemptRotation = (direction: 1 | -1) => {
      group.position.copy(previousPosition);
      group.rotation.set(0, previousRotation * (Math.PI / 2), 0);
      group.updateMatrixWorld(true);
      const worldPivot = group.localToWorld(localPivot.clone());
      const nextRotation = (previousRotation + direction + 4) % 4;
      group.rotation.y = nextRotation * (Math.PI / 2);
      group.updateMatrixWorld(true);
      const pivotCorrection = worldPivot.sub(group.localToWorld(localPivot.clone()));
      group.position.add(pivotCorrection);

      const isStored = !placed.current && !dragging.current;
      if (isStored && !clampPieceToStorageSlot(group, definition, flipped.current, visibleStorageBounds())) return false;

      let nextAnchor: GridCell | null = null;
      if (placed.current || (dragging.current && snapAnchor.current)) {
        nextAnchor = worldToAnchor(group.position.x, group.position.z);
        if (!canPlace(definition.id, currentCells(nextAnchor, nextRotation))) return false;
      }

      if (placed.current && nextAnchor) {
        if (!placePiece(definition.id, currentCells(nextAnchor, nextRotation))) return false;
        anchor.current = nextAnchor;
      }
      if (dragging.current) {
        dragTarget.current.add(group.position.clone().sub(previousPosition));
        if (nextAnchor) snapAnchor.current = nextAnchor;
      }
      rotation.current = nextRotation;
      motionTarget.current = null;
      return true;
    };

    if (!attemptRotation(1) && !attemptRotation(-1)) {
      group.position.copy(previousPosition);
      group.rotation.set(0, previousRotation * (Math.PI / 2), 0);
      gsap.killTweensOf(group.rotation, "z");
      gsap.timeline({ onUpdate: invalidate })
        .to(group.rotation, { z: 0.045, duration: 0.04, ease: "power1.out" })
        .to(group.rotation, { z: -0.045, duration: 0.07, ease: "power1.inOut" })
        .to(group.rotation, { z: 0, duration: 0.04, ease: "power1.in" });
    }
    invalidate();
  }, [canPlace, currentCells, definition, gameState, invalidate, placePiece, rotationRequest, selected, visibleStorageBounds]);

  useEffect(() => {
    if (!selected || gameState !== "PLAYING") {
      handledFlipRequest.current = flipRequest;
      return;
    }
    const group = groupRef.current;
    const body = bodyRef.current;
    if (flipRequest === handledFlipRequest.current || !group || !body) return;
    handledFlipRequest.current = flipRequest;

    const previousPosition = group.position.clone();
    const previousFlipped = flipped.current;
    const nextFlipped = !previousFlipped;
    const [pivotX, pivotZ] = definition.cells[cursorCellIndex.current] ?? definition.cells[0];
    const oldLocalPivot = new THREE.Vector3((previousFlipped ? -pivotX : pivotX) * CELL_SIZE, 0, pivotZ * CELL_SIZE);
    const nextLocalPivot = new THREE.Vector3((nextFlipped ? -pivotX : pivotX) * CELL_SIZE, 0, pivotZ * CELL_SIZE);
    group.updateMatrixWorld(true);
    const worldPivot = group.localToWorld(oldLocalPivot);
    body.scale.x = nextFlipped ? -1 : 1;
    group.updateMatrixWorld(true);
    group.position.add(worldPivot.sub(group.localToWorld(nextLocalPivot)));

    const isStored = !placed.current && !dragging.current;
    let valid = !isStored || clampPieceToStorageSlot(group, definition, nextFlipped, visibleStorageBounds());
    let nextAnchor: GridCell | null = null;
    if (valid && (placed.current || (dragging.current && snapAnchor.current))) {
      nextAnchor = worldToAnchor(group.position.x, group.position.z);
      valid = canPlace(definition.id, currentCells(nextAnchor, rotation.current, nextFlipped));
    }
    if (valid && placed.current && nextAnchor) {
      valid = placePiece(definition.id, currentCells(nextAnchor, rotation.current, nextFlipped));
      if (valid) anchor.current = nextAnchor;
    }

    if (!valid) {
      group.position.copy(previousPosition);
      body.scale.x = previousFlipped ? -1 : 1;
      gsap.killTweensOf(group.rotation, "z");
      gsap.timeline({ onUpdate: invalidate })
        .to(group.rotation, { z: 0.045, duration: 0.04, ease: "power1.out" })
        .to(group.rotation, { z: -0.045, duration: 0.07, ease: "power1.inOut" })
        .to(group.rotation, { z: 0, duration: 0.04, ease: "power1.in" });
      return;
    }

    if (dragging.current) {
      dragTarget.current.add(group.position.clone().sub(previousPosition));
      if (nextAnchor) snapAnchor.current = nextAnchor;
    }
    flipped.current = nextFlipped;
    motionTarget.current = null;
    invalidate();
  }, [canPlace, currentCells, definition, flipRequest, gameState, invalidate, placePiece, selected, visibleStorageBounds]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    if (gameState === "MENU") {
      group.position.copy(solved);
      group.rotation.y = definition.solvedRotation * (Math.PI / 2);
      return;
    }

    if (gameState === "ANIMATING") {
      const elapsed = (performance.now() - startedAt) / 1000;
      const pieceIndex = PIECES.findIndex((piece) => piece.id === definition.id);
      const delay = 0.85 + pieceIndex * 0.16;
      const progress = smoothstep((elapsed - delay) / 1.35);
      const midpoint = solved.clone().lerp(tray, 0.5);
      const pathDirection = tray.clone().sub(solved);
      const perpendicular = new THREE.Vector3(-pathDirection.z, 0, pathDirection.x).normalize();
      midpoint.addScaledVector(perpendicular, (pieceIndex % 2 === 0 ? 1 : -1) * (0.65 + (pieceIndex % 3) * 0.18));
      const inverse = 1 - progress;
      group.position.set(
        inverse * inverse * solved.x + 2 * inverse * progress * midpoint.x + progress * progress * tray.x,
        THREE.MathUtils.lerp(solved.y, tray.y, progress) + Math.sin(Math.PI * progress) * (1.15 + (pieceIndex % 3) * 0.12),
        inverse * inverse * solved.z + 2 * inverse * progress * midpoint.z + progress * progress * tray.z,
      );
      group.rotation.y = THREE.MathUtils.lerp(
        definition.solvedRotation * (Math.PI / 2),
        definition.trayRotation * (Math.PI / 2),
        progress,
      );
      invalidate();
      return;
    }

    if (dragging.current) {
      group.position.lerp(dragTarget.current, snapAnchor.current ? 0.34 : 0.48);
      group.scale.lerp(snapAnchor.current ? new THREE.Vector3(1.035, 1.035, 1.035) : new THREE.Vector3(1, 1, 1), 0.3);
      invalidate();
      return;
    }

    if (motionTarget.current) {
      group.position.lerp(motionTarget.current, 0.22);
      group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.3);
      if (group.position.distanceToSquared(motionTarget.current) < 0.0004) {
        group.position.copy(motionTarget.current);
        motionTarget.current = null;
      } else invalidate();
    }
  });

  const intersectDragPlane = (event: ThreeEvent<PointerEvent>) => {
    const point = new THREE.Vector3();
    return event.ray.intersectPlane(DRAG_PLANE, point) ? point : null;
  };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (gameState !== "PLAYING" || !groupRef.current) return;
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    const pointerTarget = event.nativeEvent.target as Element;
    pointerTarget.setPointerCapture(event.pointerId);
    (event.target as unknown as CaptureTarget).setPointerCapture(event.pointerId);
    cursorCellIndex.current = Number(event.object.userData.cellIndex ?? cursorCellIndex.current);
    pointerDownPoint.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
    onSelect(definition.id);
    if (placed.current) clearPiece(definition.id);
    placed.current = false;
    anchor.current = null;
    snapAnchor.current = null;
    motionTarget.current = null;
    dragging.current = true;
    dragTarget.current.copy(groupRef.current.position).setY(LIFT_Y);
    invalidate();
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    cursorCellIndex.current = Number(event.object.userData.cellIndex ?? cursorCellIndex.current);
    if (!dragging.current) return;
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    const hit = intersectDragPlane(event);
    if (!hit) return;
    const candidateAnchor = worldToAnchor(hit.x, hit.z);
    const candidateCells = currentCells(candidateAnchor);
    const valid = canPlace(definition.id, candidateCells);
    snapAnchor.current = valid ? candidateAnchor : null;
    if (valid) {
      dragTarget.current.copy(anchorToWorld(candidateAnchor)).setY(LIFT_Y);
    } else {
      dragTarget.current.set(hit.x, LIFT_Y, hit.z);
    }
    invalidate();
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    event.stopPropagation();
    const pointerTarget = event.nativeEvent.target as Element;
    if (pointerTarget.hasPointerCapture(event.pointerId)) pointerTarget.releasePointerCapture(event.pointerId);
    const raycastTarget = event.target as unknown as CaptureTarget;
    if (raycastTarget.hasPointerCapture(event.pointerId)) raycastTarget.releasePointerCapture(event.pointerId);
    dragging.current = false;

    const stationary = event.nativeEvent.clientX === pointerDownPoint.current.x
      && event.nativeEvent.clientY === pointerDownPoint.current.y;
    const now = performance.now();
    const intentionalReset = stationary && now - lastStationaryClick.current <= 200;
    lastStationaryClick.current = stationary ? now : 0;
    if (intentionalReset) {
      clearPiece(definition.id);
      resetToTray();
      return;
    }

    if (snapAnchor.current) {
      const targetCells = currentCells(snapAnchor.current);
      if (placePiece(definition.id, targetCells)) {
        placed.current = true;
        anchor.current = snapAnchor.current;
        motionTarget.current = anchorToWorld(snapAnchor.current);
      }
    }

    if (!placed.current) resetToTray();
    snapAnchor.current = null;
    invalidate();
  };

  return (
    <group
      ref={groupRef}
      name={`piece-${definition.id}`}
      position={solved.toArray() as [number, number, number]}
      rotation={[0, definition.solvedRotation * (Math.PI / 2), 0]}
      onPointerDown={handlePointerDown}
      onPointerOver={(event) => {
        cursorCellIndex.current = Number(event.object.userData.cellIndex ?? cursorCellIndex.current);
        onSelect(definition.id);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <group ref={bodyRef}>
        {definition.cells.map(([x, z], index) => (
          <mesh key={`${x}-${z}-${index}`} position={[x * CELL_SIZE, 0, z * CELL_SIZE]} userData={{ cellIndex: index }} castShadow receiveShadow>
            <sphereGeometry args={[0.375, 24, 16]} />
            <PlasticMaterial color={definition.color} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Socket({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, SOCKET_Y, z]}>
      <mesh receiveShadow>
        <sphereGeometry args={[0.305, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#151718" roughness={0.62} side={THREE.BackSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <torusGeometry args={[0.31, 0.035, 8, 20]} />
        <meshStandardMaterial color="#45484a" roughness={0.4} metalness={0.08} />
      </mesh>
    </group>
  );
}

function SocketLattice() {
  const sockets = useMemo(() => Array.from({ length: COLUMNS * ROWS }, (_, index) => ({
    x: BOARD_MIN_X + (index % COLUMNS) * CELL_SIZE,
    z: BOARD_MIN_Z + Math.floor(index / COLUMNS) * CELL_SIZE,
  })), []);

  return (
    <group>
      {Array.from({ length: ROWS + 1 }, (_, row) => (
        <RoundedBox key={`row-${row}`} args={[8.72, 0.11, 0.12]} radius={0.035} smoothness={3} position={[0, 0.22, (row - ROWS / 2) * CELL_SIZE]} receiveShadow>
          <meshStandardMaterial color="#3d4042" roughness={0.45} metalness={0.08} />
        </RoundedBox>
      ))}
      {Array.from({ length: COLUMNS + 1 }, (_, column) => (
        <RoundedBox key={`column-${column}`} args={[0.12, 0.11, 4.04]} radius={0.035} smoothness={3} position={[(column - COLUMNS / 2) * CELL_SIZE, 0.22, 0]} receiveShadow>
          <meshStandardMaterial color="#3d4042" roughness={0.45} metalness={0.08} />
        </RoundedBox>
      ))}
      {sockets.map((socket) => <Socket key={`${socket.x}-${socket.z}`} {...socket} />)}
    </group>
  );
}

function ClamshellCase({ gameState }: { gameState: GameState }) {
  const lidRef = useRef<THREE.Group>(null);
  const lidMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const lidShadowMaterialRef = useRef<THREE.MeshDepthMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const lid = lidRef.current;
    const material = lidMaterialRef.current;
    const shadowMaterial = lidShadowMaterialRef.current;
    if (!lid || !material || !shadowMaterial) return;

    if (gameState === "MENU") {
      lid.visible = true;
      lid.rotation.x = CLOSED_LID_ANGLE;
      material.opacity = 0.9;
      shadowMaterial.opacity = 0.9;
      return;
    }
    if (gameState !== "ANIMATING") return;

    lid.visible = true;
    const timeline = gsap.timeline({
      onComplete: () => { lid.visible = false; },
      onUpdate: invalidate,
    });
    timeline.to(lid.rotation, { x: OPEN_LID_ANGLE, duration: 1.55, ease: "power2.inOut" }, 0);
    timeline.to(material, { opacity: 0, duration: 1.35, ease: "power2.inOut" }, 0.2);
    timeline.to(shadowMaterial, { opacity: 0, duration: 1.35, ease: "power2.inOut" }, 0.2);
    return () => { timeline.kill(); };
  }, [gameState, invalidate]);

  return (
    <group>
      <RoundedBox args={[10.15, 0.28, 5.5]} radius={0.2} smoothness={6} position={[0, -0.12, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#202324" roughness={0.32} metalness={0.08} />
      </RoundedBox>
      <RoundedBox args={[BOARD_WIDTH, 0.16, BOARD_DEPTH]} radius={0.12} smoothness={5} position={[0, 0.05, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#303335" roughness={0.46} metalness={0.08} />
      </RoundedBox>
      <SocketLattice />
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.12, -2.72]} castShadow receiveShadow>
        <cylinderGeometry args={[0.11, 0.11, 9.8, 20]} />
        <meshStandardMaterial color="#1b1e1f" roughness={0.3} metalness={0.1} />
      </mesh>
      <group ref={lidRef} position={[0, 0.86, -2.72]} rotation={[CLOSED_LID_ANGLE, 0, 0]}>
        <RoundedBox args={[10.15, 0.1, 5.5]} radius={0.2} smoothness={6} position={[0, 0, -2.72]} castShadow receiveShadow>
          <meshPhysicalMaterial
            ref={lidMaterialRef}
            color="#d9e2e3"
            roughness={0.2}
            transmission={0.88}
            opacity={0.9}
            transparent
            thickness={0.18}
            ior={1.35}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
          <meshDepthMaterial
            ref={lidShadowMaterialRef}
            attach="customDepthMaterial"
            depthPacking={THREE.RGBADepthPacking}
            transparent
            opacity={0.9}
          />
        </RoundedBox>
      </group>
    </group>
  );
}

function Scene({
  gameState,
  startedAt,
  selectedPiece,
  rotationRequest,
  flipRequest,
  onSelectPiece,
  onAnimationComplete,
}: {
  gameState: GameState;
  startedAt: number;
  selectedPiece: string | null;
  rotationRequest: number;
  flipRequest: number;
  onSelectPiece: (id: string) => void;
  onAnimationComplete: () => void;
}) {
  const { camera, invalidate, size } = useThree();
  const [, setGrid] = useState<GridMatrix>(emptyGrid);
  const gridRef = useRef<GridMatrix>(emptyGrid());
  const completionSent = useRef(false);
  const focus = useRef(new THREE.Vector3());
  const cameraTargets = useMemo(() => {
    const aspect = Math.max(0.45, size.width / Math.max(1, size.height));
    const halfFov = THREE.MathUtils.degToRad(15);
    const fitDistance = (width: number, height: number) => Math.max(
      height / (2 * Math.tan(halfFov)),
      width / (2 * Math.tan(halfFov) * aspect),
    );
    const menuDistance = fitDistance(12.4, 7.2);
    const toolbarReserve = Math.min(0.22, 88 / Math.max(1, size.height));
    const playDistance = fitDistance(23.5, 21.5 / (1 - toolbarReserve));
    return {
      menu: new THREE.Vector3(0, menuDistance * 0.93, MENU_FOCUS.z + menuDistance * 0.37),
      play: new THREE.Vector3(0, playDistance, PLAY_FOCUS.z),
    };
  }, [size.height, size.width]);

  const commitGrid = useCallback((nextGrid: GridMatrix) => {
    gridRef.current = nextGrid;
    setGrid(nextGrid);
  }, []);

  const canPlace = useCallback((pieceId: string, cells: GridCell[]) => cells.every(({ row, column }) => (
    row >= 0 && row < ROWS && column >= 0 && column < COLUMNS
      && (gridRef.current[row][column] === null || gridRef.current[row][column] === pieceId)
  )), []);

  const placePiece = useCallback((pieceId: string, cells: GridCell[]) => {
    const cleared = gridRef.current.map((row) => row.map((value) => value === pieceId ? null : value));
    const valid = cells.every(({ row, column }) => (
      row >= 0 && row < ROWS && column >= 0 && column < COLUMNS && cleared[row][column] === null
    ));
    if (!valid) return false;
    cells.forEach(({ row, column }) => { cleared[row][column] = pieceId; });
    commitGrid(cleared);
    return true;
  }, [commitGrid]);

  const clearPiece = useCallback((pieceId: string) => {
    commitGrid(gridRef.current.map((row) => row.map((value) => value === pieceId ? null : value)));
  }, [commitGrid]);

  useFrame(() => {
    if (gameState === "MENU") {
      completionSent.current = false;
      camera.position.copy(cameraTargets.menu);
      camera.lookAt(MENU_FOCUS);
      return;
    }
    if (gameState === "ANIMATING") {
      const elapsed = (performance.now() - startedAt) / 1000;
      const progress = smoothstep((elapsed - 0.25) / 3.55);
      camera.position.lerpVectors(cameraTargets.menu, cameraTargets.play, progress);
      focus.current.lerpVectors(MENU_FOCUS, PLAY_FOCUS, progress);
      camera.lookAt(focus.current);
      invalidate();
      if (elapsed >= 4.15 && !completionSent.current) {
        completionSent.current = true;
        onAnimationComplete();
      }
    } else {
      camera.position.copy(cameraTargets.play);
      camera.lookAt(PLAY_FOCUS);
    }
  });

  return (
    <>
      <color attach="background" args={["#e6dfd2"]} />
      <ambientLight intensity={0.68} color="#dce7ff" />
      <hemisphereLight args={["#f7f2e9", "#596061", 0.72]} />
      <pointLight position={[0, 7.5, -0.8]} intensity={22} distance={18} decay={2} color="#fff5e8" />
      <directionalLight
        position={[0.8, 15, 2.5]}
        intensity={1.7}
        color="#fff3dc"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.00035}
        shadow-normalBias={0.018}
        shadow-radius={5}
      />
      <ClamshellCase gameState={gameState} />
      {PIECES.map((definition) => (
        <Polyomino
          key={definition.id}
          definition={definition}
          gameState={gameState}
          startedAt={startedAt}
          selected={selectedPiece === definition.id}
          rotationRequest={rotationRequest}
          flipRequest={flipRequest}
          onSelect={onSelectPiece}
          canPlace={canPlace}
          placePiece={placePiece}
          clearPiece={clearPiece}
        />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 3]} receiveShadow>
        <planeGeometry args={[42, 36]} />
        <meshStandardMaterial color="#e6dfd2" roughness={0.92} />
      </mesh>
    </>
  );
}

export function PuzzleScene() {
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [startedAt, setStartedAt] = useState(0);
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [rotationRequest, setRotationRequest] = useState(0);
  const [flipRequest, setFlipRequest] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  const requestRotation = useCallback(() => {
    if (gameState === "PLAYING" && selectedPiece) setRotationRequest((request) => request + 1);
  }, [gameState, selectedPiece]);

  const requestFlip = useCallback(() => {
    if (gameState === "PLAYING" && selectedPiece) setFlipRequest((request) => request + 1);
  }, [gameState, selectedPiece]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyF") {
        requestFlip();
        return;
      }
      if (event.code !== "KeyR" && event.code !== "Space") return;
      if (event.code === "Space") event.preventDefault();
      requestRotation();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestFlip, requestRotation]);

  return (
    <div className="webgl-stage">
      <Canvas
        key={canvasKey}
        frameloop="demand"
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ position: [0, 18, 22], fov: 30, near: 0.1, far: 100 }}
        dpr={1}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMappingExposure = 1.08;
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            setContextLost(true);
          }, { once: true });
        }}
      >
        <Scene
          gameState={gameState}
          startedAt={startedAt}
          selectedPiece={selectedPiece}
          rotationRequest={rotationRequest}
          flipRequest={flipRequest}
          onSelectPiece={setSelectedPiece}
          onAnimationComplete={() => setGameState("PLAYING")}
        />
      </Canvas>

      {gameState !== "PLAYING" && (
        <div className={`game-start${gameState === "MENU" ? "" : " game-start--hidden"}`} aria-hidden={gameState !== "MENU"}>
          <button type="button" disabled={gameState !== "MENU"} onClick={() => {
            setStartedAt(performance.now());
            setGameState("ANIMATING");
          }}>Play</button>
        </div>
      )}

      <div className="bottom-hud">
        <div className={`piece-tools${selectedPiece && gameState === "PLAYING" ? " piece-tools--visible" : ""}`} aria-hidden={!selectedPiece || gameState !== "PLAYING"}>
          <span>Piece {selectedPiece}</span>
          <button type="button" onClick={requestRotation} aria-label={`Rotate piece ${selectedPiece ?? ""} clockwise`}>↻ Rotate</button>
          <button type="button" onClick={requestFlip} aria-label={`Flip piece ${selectedPiece ?? ""} horizontally`}>↔ Flip</button>
        </div>
        <p aria-hidden={gameState !== "PLAYING"} className={`play-hint${gameState === "PLAYING" ? " play-hint--visible" : ""}`}>Drag · R/Space rotate · F flip</p>
      </div>

      {contextLost && (
        <div className="webgl-recovery" role="alert">
          <p>The 3D view paused to protect graphics memory.</p>
          <button type="button" onClick={() => {
            setContextLost(false);
            setCanvasKey((key) => key + 1);
          }}>Restore 3D view</button>
        </div>
      )}
    </div>
  );
}
