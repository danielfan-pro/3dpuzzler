"use client";

import { RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Capacitor } from "@capacitor/core";
import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LEVELS, type FixedPiece, type LevelConfig, type PieceId } from "@/data/levels";
import { INITIAL_HINT_BALANCE, loadGameProgress, saveGameProgress, type GameProgress, type StoredPiecePlacement } from "@/lib/gameStorage";
import { getHapticsEnabled, setHapticsEnabled, triggerHaptic } from "@/lib/nativeHaptics";
import { solvePuzzle } from "@/lib/puzzleSolver";

type Point3 = readonly [number, number, number];
type Cell = readonly [number, number];
type GridCell = { row: number; column: number };
type GameState = "MENU" | "ANIMATING" | "PLAYING";
type GridMatrix = Array<Array<string | null>>;
type LayoutMode = "LANDSCAPE_TABLET_DESKTOP" | "MOBILE_PORTRAIT";
type PiecePreviewState = { id: PieceId; rotation: number; flipped: boolean };
type HintFeedback = { message: string; piece: PiecePreviewState | null };
type CaptureTarget = {
  setPointerCapture: (pointerId: number) => void;
  hasPointerCapture: (pointerId: number) => boolean;
  releasePointerCapture: (pointerId: number) => void;
};

type PieceDefinition = {
  id: PieceId;
  color: string;
  cells: readonly Cell[];
  solvedAnchor: GridCell;
  solvedRotation: number;
  trayPosition: Point3;
  trayRotation: number;
};

const COLUMNS = 11;
const ROWS = 5;
const GRID_CELL_SIZE_X = 0.78;
const GRID_CELL_SIZE_Z = 0.78;
const SOCKET_Y = 0.27;
const REST_Y = 0.48;
const PLACED_Y = 0.43;
const LIFT_Y = 0.95;
const TRAY_SCALE = 0.85;
const SCENE_Z_OFFSET = 1.2;
const BOARD_ANCHOR: Point3 = [0, 0, SCENE_Z_OFFSET];
const STORAGE_GRID_ANCHOR: Point3 = [0, REST_Y, 6.75 + SCENE_Z_OFFSET];
const STORAGE_ROW_STRIDE = 2.4;
const BOARD_WIDTH = 9.55;
const BOARD_DEPTH = 4.9;
const BOARD_MIN_X = -((COLUMNS - 1) * GRID_CELL_SIZE_X) / 2;
const BOARD_MIN_Z = -((ROWS - 1) * GRID_CELL_SIZE_Z) / 2;
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LIFT_Y);
const MENU_FOCUS = new THREE.Vector3(0, 0.08, 0);
const PLAY_FOCUS = new THREE.Vector3(0, 0.08, 6.8);
const CLOSED_LID_ANGLE = Math.PI;
const OPEN_LID_ANGLE = 0;
const LEVEL_TRANSITION_MS = 750;
const EMPTY_STORED_PLACEMENTS: readonly StoredPiecePlacement[] = [];

const MOBILE_STORAGE_SLOTS: readonly Point3[] = [
  [-4.35, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2]], [-1.45, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2]], [1.45, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2]], [4.35, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2]],
  [-4.35, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2] + STORAGE_ROW_STRIDE], [-1.45, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2] + STORAGE_ROW_STRIDE], [1.45, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2] + STORAGE_ROW_STRIDE], [4.35, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2] + STORAGE_ROW_STRIDE],
  [-4.35, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2] + STORAGE_ROW_STRIDE * 2], [-1.45, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2] + STORAGE_ROW_STRIDE * 2], [1.45, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2] + STORAGE_ROW_STRIDE * 2], [4.35, STORAGE_GRID_ANCHOR[1], STORAGE_GRID_ANCHOR[2] + STORAGE_ROW_STRIDE * 2],
];

const LANDSCAPE_STORAGE_SLOTS: readonly Point3[] = [
  [-11.55, REST_Y, -1.45], [-8.25, REST_Y, -1.45],
  [-11.55, REST_Y, 1.3], [-8.25, REST_Y, 1.3],
  [-11.55, REST_Y, 4.05], [-8.25, REST_Y, 4.05],
  [8.25, REST_Y, -1.45], [11.55, REST_Y, -1.45],
  [8.25, REST_Y, 1.3], [11.55, REST_Y, 1.3],
  [8.25, REST_Y, 4.05], [11.55, REST_Y, 4.05],
];

const PIECES: readonly PieceDefinition[] = [
  { id: "A", color: "#ff3b30", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], solvedAnchor: { column: 3, row: 4 }, solvedRotation: 2, trayPosition: [-7.2, REST_Y, 5], trayRotation: 0 },
  { id: "B", color: "#ee9b22", cells: [[0, 0], [1, 0], [2, 0], [1, -1], [0, 1]], solvedAnchor: { column: 5, row: 2 }, solvedRotation: 3, trayPosition: [-7.2, REST_Y, 9], trayRotation: 0 },
  { id: "C", color: "#ffd41f", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]], solvedAnchor: { column: 9, row: 4 }, solvedRotation: 2, trayPosition: [-2.6, REST_Y, 5], trayRotation: 0 },
  { id: "D", color: "#a9d532", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]], solvedAnchor: { column: 1, row: 3 }, solvedRotation: 1, trayPosition: [-7.2, REST_Y, 13], trayRotation: 0 },
  { id: "E", color: "#00a98f", cells: [[0, 0], [1, 0], [2, 0], [1, 1]], solvedAnchor: { column: 8, row: 0 }, solvedRotation: 0, trayPosition: [7.1, REST_Y, 9], trayRotation: 0 },
  { id: "F", color: "#91ddd1", cells: [[0, 0], [1, 0], [2, 0], [1, 1], [2, 1]], solvedAnchor: { column: 5, row: 1 }, solvedRotation: 2, trayPosition: [2.6, REST_Y, 9], trayRotation: 0 },
  { id: "G", color: "#69cff0", cells: [[0, 0], [1, 0], [1, -1]], solvedAnchor: { column: 10, row: 4 }, solvedRotation: 1, trayPosition: [7.1, REST_Y, 5], trayRotation: 0 },
  { id: "H", color: "#0a9bd8", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]], solvedAnchor: { column: 0, row: 0 }, solvedRotation: 0, trayPosition: [-2.6, REST_Y, 13], trayRotation: 0 },
  { id: "I", color: "#1d58a5", cells: [[0, 0], [1, 0], [2, 0], [2, -1]], solvedAnchor: { column: 8, row: 2 }, solvedRotation: 0, trayPosition: [2.6, REST_Y, 13], trayRotation: 0 },
  { id: "J", color: "#6f258e", cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], solvedAnchor: { column: 2, row: 2 }, solvedRotation: 0, trayPosition: [7.1, REST_Y, 13], trayRotation: 0 },
  { id: "K", color: "#8b0000", cells: [[1, 0], [2, 0], [0, 1], [1, 1]], solvedAnchor: { column: 6, row: 3 }, solvedRotation: 1, trayPosition: [-2.6, REST_Y, 9], trayRotation: 0 },
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

function transformedCells(cells: readonly Cell[], rotation: number, flipped = false): Cell[] {
  return cells.map((cell) => rotateCell([flipped ? -cell[0] : cell[0], cell[1]], rotation));
}

function PiecePreview({ state }: { state: PiecePreviewState | null }) {
  if (!state) return <span className="piece-preview__empty">No piece selected</span>;
  const definition = PIECES.find((piece) => piece.id === state.id);
  if (!definition) return <span className="piece-preview__empty">No piece selected</span>;
  const cells = transformedCells(definition.cells, state.rotation, state.flipped);
  const minX = Math.min(...cells.map(([x]) => x));
  const maxX = Math.max(...cells.map(([x]) => x));
  const minZ = Math.min(...cells.map(([, z]) => z));
  const maxZ = Math.max(...cells.map(([, z]) => z));
  const pitch = 12;
  const padding = 8;
  const width = (maxX - minX) * pitch + pitch + padding * 2;
  const height = (maxZ - minZ) * pitch + pitch + padding * 2;
  return (
    <svg className="piece-preview__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Selected piece ${state.id}`}>
      {cells.map(([x, z], index) => (
        <circle
          key={`${x}-${z}-${index}`}
          cx={(x - minX) * pitch + pitch / 2 + padding}
          cy={(z - minZ) * pitch + pitch / 2 + padding}
          r="4.6"
          fill={definition.color}
          stroke="rgba(255,255,255,.3)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

function centeredStoragePosition(definition: PieceDefinition, slot: Point3): Point3 {
  const cells = transformedCells(definition.cells, definition.trayRotation);
  const minX = Math.min(...cells.map(([x]) => x));
  const maxX = Math.max(...cells.map(([x]) => x));
  const minZ = Math.min(...cells.map(([, z]) => z));
  const maxZ = Math.max(...cells.map(([, z]) => z));
  return [
    slot[0] - ((minX + maxX) / 2) * GRID_CELL_SIZE_X * TRAY_SCALE,
    slot[1],
    slot[2] - ((minZ + maxZ) / 2) * GRID_CELL_SIZE_Z * TRAY_SCALE,
  ];
}

function storagePositionForTransform(
  definition: PieceDefinition,
  defaultPosition: THREE.Vector3,
  rotation: number,
  flipped: boolean,
) {
  const defaultCells = transformedCells(definition.cells, definition.trayRotation);
  const currentCells = transformedCells(definition.cells, rotation, flipped);
  const boundsCenter = (cells: Cell[]) => ({
    x: (Math.min(...cells.map(([x]) => x)) + Math.max(...cells.map(([x]) => x))) / 2,
    z: (Math.min(...cells.map(([, z]) => z)) + Math.max(...cells.map(([, z]) => z))) / 2,
  });
  const defaultCenter = boundsCenter(defaultCells);
  const currentCenter = boundsCenter(currentCells);
  return new THREE.Vector3(
    defaultPosition.x + (defaultCenter.x - currentCenter.x) * GRID_CELL_SIZE_X * TRAY_SCALE,
    defaultPosition.y,
    defaultPosition.z + (defaultCenter.z - currentCenter.z) * GRID_CELL_SIZE_Z * TRAY_SCALE,
  );
}

function cellsForPlacement(anchor: GridCell, cells: readonly Cell[], rotation: number, flipped = false): GridCell[] {
  return transformedCells(cells, rotation, flipped).map(([x, z]) => {
    return { column: anchor.column + x, row: anchor.row + z };
  });
}

function fixedAnchorFor(definition: PieceDefinition, fixedPiece: FixedPiece): GridCell {
  const transformed = transformedCells(definition.cells, fixedPiece.rotation, fixedPiece.flipped);
  const minX = Math.min(...transformed.map(([x]) => x));
  const minZ = Math.min(...transformed.map(([, z]) => z));
  return { column: fixedPiece.position[0] - minX, row: fixedPiece.position[1] - minZ };
}

function worldToAnchor(x: number, z: number): GridCell {
  return {
    column: Math.round((x - BOARD_ANCHOR[0] - BOARD_MIN_X) / GRID_CELL_SIZE_X),
    row: Math.round((z - BOARD_ANCHOR[2] - BOARD_MIN_Z) / GRID_CELL_SIZE_Z),
  };
}

function anchorToWorld(anchor: GridCell): THREE.Vector3 {
  return new THREE.Vector3(
    BOARD_ANCHOR[0] + BOARD_MIN_X + anchor.column * GRID_CELL_SIZE_X,
    PLACED_Y,
    BOARD_ANCHOR[2] + BOARD_MIN_Z + anchor.row * GRID_CELL_SIZE_Z,
  );
}

function storageBoundsFor([x, , z]: Point3, layoutMode: LayoutMode) {
  if (layoutMode === "LANDSCAPE_TABLET_DESKTOP") {
    const leftWing = x < 0;
    const outerColumn = Math.abs(x) > 9.8;
    const horizontal = leftWing
      ? outerColumn ? { minX: -13.3, maxX: -9.9 } : { minX: -9.75, maxX: -6.65 }
      : outerColumn ? { minX: 9.9, maxX: 13.3 } : { minX: 6.65, maxX: 9.75 };
    const vertical = z < -0.075
      ? { minZ: -2.8, maxZ: -0.1 }
      : z < 2.675
        ? { minZ: -0.05, maxZ: 2.65 }
        : { minZ: 2.7, maxZ: 5.4 };
    return { ...horizontal, ...vertical };
  }
  const localZ = z - SCENE_Z_OFFSET;
  const horizontal = x < -2.9
    ? { minX: -5.78, maxX: -2.92 }
    : x < 0
      ? { minX: -2.88, maxX: -0.02 }
      : x < 2.9
        ? { minX: 0.02, maxX: 2.88 }
        : { minX: 2.92, maxX: 5.78 };
  const vertical = localZ < 7.95
    ? { minZ: 5.35, maxZ: 7.9 }
    : localZ < 10.35
      ? { minZ: 8.05, maxZ: 10.3 }
      : { minZ: 10.45, maxZ: 13.85 };
  return {
    ...horizontal,
    minZ: vertical.minZ + SCENE_Z_OFFSET,
    maxZ: vertical.maxZ + SCENE_Z_OFFSET,
  };
}

function clampPieceToStorageSlot(
  group: THREE.Group,
  definition: PieceDefinition,
  storagePosition: Point3,
  flipped: boolean,
  viewport: { minX: number; maxX: number; minZ: number; maxZ: number },
  layoutMode: LayoutMode,
) {
  group.updateMatrixWorld(true);
  const worldScale = group.getWorldScale(new THREE.Vector3());
  const sphereRadius = 0.375 * Math.max(Math.abs(worldScale.x), Math.abs(worldScale.z));
  const bounds = definition.cells.reduce((result, [x, z]) => {
    const world = group.localToWorld(new THREE.Vector3((flipped ? -x : x) * GRID_CELL_SIZE_X, 0, z * GRID_CELL_SIZE_Z));
    return {
      minX: Math.min(result.minX, world.x - sphereRadius),
      maxX: Math.max(result.maxX, world.x + sphereRadius),
      minZ: Math.min(result.minZ, world.z - sphereRadius),
      maxZ: Math.max(result.maxZ, world.z + sphereRadius),
    };
  }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const storageSlot = storageBoundsFor(storagePosition, layoutMode);
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
  selected,
  rotationRequest,
  flipRequest,
  storagePosition,
  fixedPiece,
  restoredPiece,
  layoutMode,
  resetToken,
  hinted,
  levelTransitioning,
  unboxOrder,
  availablePieceCount,
  onSelect,
  canPlace,
  placePiece,
  clearPiece,
  onPlacementChange,
  onPlacementRemove,
  onTransformChange,
}: {
  definition: PieceDefinition;
  gameState: GameState;
  selected: boolean;
  rotationRequest: number;
  flipRequest: number;
  storagePosition: Point3;
  fixedPiece: FixedPiece | null;
  restoredPiece: StoredPiecePlacement | null;
  layoutMode: LayoutMode;
  resetToken: number;
  hinted: boolean;
  levelTransitioning: boolean;
  unboxOrder: number;
  availablePieceCount: number;
  onSelect: (id: string | null) => void;
  canPlace: (id: string, cells: GridCell[]) => boolean;
  placePiece: (id: string, cells: GridCell[]) => boolean;
  clearPiece: (id: string) => void;
  onPlacementChange: (placement: StoredPiecePlacement) => void;
  onPlacementRemove: (pieceId: PieceId) => void;
  onTransformChange: (state: PiecePreviewState) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const pointerActive = useRef(false);
  const pointerStartedPlaced = useRef(false);
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
  const previousLayoutMode = useRef(layoutMode);
  const preserveTrayTransform = useRef(false);
  const dragTarget = useRef(new THREE.Vector3(...storagePosition));
  const motionTarget = useRef<THREE.Vector3 | null>(null);
  const solved = useMemo(() => anchorToWorld(definition.solvedAnchor), [definition.solvedAnchor]);
  const tray = useMemo(() => new THREE.Vector3(...storagePosition), [storagePosition]);
  const targetTransform = useMemo(() => {
    if (fixedPiece) {
      const targetAnchor = fixedAnchorFor(definition, fixedPiece);
      return { position: anchorToWorld(targetAnchor), rotation: fixedPiece.rotation, flipped: fixedPiece.flipped, anchor: targetAnchor };
    }
    if (restoredPiece) {
      const targetAnchor = { column: restoredPiece.anchor[0], row: restoredPiece.anchor[1] };
      return { position: anchorToWorld(targetAnchor), rotation: restoredPiece.rotation, flipped: restoredPiece.flipped, anchor: targetAnchor };
    }
    return { position: tray, rotation: definition.trayRotation, flipped: false, anchor: null };
  }, [definition, fixedPiece, restoredPiece, tray]);
  const hitArea = useMemo(() => {
    const xs = definition.cells.map(([x]) => x * GRID_CELL_SIZE_X);
    const zs = definition.cells.map(([, z]) => z * GRID_CELL_SIZE_Z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const padding = layoutMode === "MOBILE_PORTRAIT" ? 0.03 : 0.22;
    return {
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      width: maxX - minX + 0.75 + padding * 2,
      depth: maxZ - minZ + 0.75 + padding * 2,
    };
  }, [definition.cells, layoutMode]);
  const { camera, gl, invalidate } = useThree();

  const currentCells = useCallback((targetAnchor: GridCell, targetRotation = rotation.current, targetFlipped = flipped.current) => (
    cellsForPlacement(targetAnchor, definition.cells, targetRotation, targetFlipped)
  ), [definition.cells]);

  const visibleStorageBounds = useCallback(() => {
    const canvasWidth = Math.max(1, gl.domElement.clientWidth);
    const horizontalNdc = Math.max(0, 1 - 64 / canvasWidth);
    const intersections = [
      [-horizontalNdc, -1], [horizontalNdc, -1],
      [-horizontalNdc, 1], [horizontalNdc, 1],
    ].map(([x, y]) => {
      const point = new THREE.Vector3(x, y, 0.5).unproject(camera);
      const direction = point.sub(camera.position).normalize();
      const distance = (REST_Y - camera.position.y) / direction.y;
      return camera.position.clone().add(direction.multiplyScalar(distance));
    });
    return {
      minX: Math.min(...intersections.map((point) => point.x)),
      maxX: Math.max(...intersections.map((point) => point.x)),
      minZ: Math.min(...intersections.map((point) => point.z)) + 0.45,
      maxZ: Math.max(...intersections.map((point) => point.z)) - 0.45,
    };
  }, [camera, gl.domElement]);

  const resetToTray = useCallback((resetTransform = false) => {
    const group = groupRef.current;
    const wasPlaced = placed.current;
    dragging.current = false;
    placed.current = false;
    anchor.current = null;
    snapAnchor.current = null;
    // Removing the persisted board placement rerenders this piece immediately.
    // Keep its current world transform so that rerender does not snap it to the
    // tray before the return tween can run (including intentional resets).
    preserveTrayTransform.current = Boolean(restoredPiece) || wasPlaced;
    if (resetTransform) {
      rotation.current = definition.trayRotation;
      flipped.current = false;
      if (group) group.rotation.set(0, definition.trayRotation * (Math.PI / 2), 0);
      if (bodyRef.current) bodyRef.current.scale.x = 1;
    }
    const trayTarget = storagePositionForTransform(definition, tray, rotation.current, flipped.current);
    if (selected) onTransformChange({ id: definition.id, rotation: rotation.current, flipped: flipped.current });
    if (group) {
      gsap.killTweensOf([group.position, group.scale]);
      // Board pieces receive their auto-packed slot only after their placement
      // is removed. The target-sync effect below animates to that new slot.
      if (!wasPlaced && !restoredPiece) {
        gsap.to(group.position, { x: trayTarget.x, y: trayTarget.y, z: trayTarget.z, duration: 0.32, ease: "power2.inOut", onUpdate: invalidate });
      }
      gsap.to(group.scale, { x: TRAY_SCALE, y: TRAY_SCALE, z: TRAY_SCALE, duration: 0.25, ease: "power2.out", onUpdate: invalidate });
    }
    motionTarget.current = null;
    onPlacementRemove(definition.id);
    invalidate();
  }, [definition, invalidate, onPlacementRemove, onTransformChange, restoredPiece, selected, tray]);

  useEffect(() => {
    if (!selected || fixedPiece || gameState !== "PLAYING" || levelTransitioning) {
      handledRotationRequest.current = rotationRequest;
      return;
    }
    if (rotationRequest === handledRotationRequest.current || !groupRef.current) return;
    handledRotationRequest.current = rotationRequest;
    const group = groupRef.current;
    const previousRotation = rotation.current;
    const previousPosition = group.position.clone();
    const isStoredAtStart = !placed.current && !dragging.current;
    const [cursorPivotX, cursorPivotZ] = definition.cells[cursorCellIndex.current] ?? definition.cells[0];
    const storageXs = definition.cells.map(([x]) => (flipped.current ? -x : x) * GRID_CELL_SIZE_X);
    const storageZs = definition.cells.map(([, z]) => z * GRID_CELL_SIZE_Z);
    const pivotX = isStoredAtStart ? (Math.min(...storageXs) + Math.max(...storageXs)) / 2 : (flipped.current ? -cursorPivotX : cursorPivotX) * GRID_CELL_SIZE_X;
    const pivotZ = isStoredAtStart ? (Math.min(...storageZs) + Math.max(...storageZs)) / 2 : cursorPivotZ * GRID_CELL_SIZE_Z;
    const localPivot = new THREE.Vector3(pivotX, 0, pivotZ);

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
      if (isStored) clampPieceToStorageSlot(group, definition, storagePosition, flipped.current, visibleStorageBounds(), layoutMode);

      let nextAnchor: GridCell | null = null;
      if (placed.current || (dragging.current && snapAnchor.current)) {
        nextAnchor = worldToAnchor(group.position.x, group.position.z);
        if (!canPlace(definition.id, currentCells(nextAnchor, nextRotation))) return false;
      }

      if (placed.current && nextAnchor) {
        if (!placePiece(definition.id, currentCells(nextAnchor, nextRotation))) return false;
        anchor.current = nextAnchor;
        onPlacementChange({ pieceId: definition.id, anchor: [nextAnchor.column, nextAnchor.row], rotation: nextRotation, flipped: flipped.current });
      }
      if (dragging.current) {
        dragTarget.current.add(group.position.clone().sub(previousPosition));
        if (nextAnchor) snapAnchor.current = nextAnchor;
      }
      rotation.current = nextRotation;
      onTransformChange({ id: definition.id, rotation: nextRotation, flipped: flipped.current });
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
  }, [canPlace, currentCells, definition, fixedPiece, gameState, invalidate, layoutMode, levelTransitioning, onPlacementChange, onTransformChange, placePiece, rotationRequest, selected, storagePosition, visibleStorageBounds]);

  useEffect(() => {
    if (!selected || fixedPiece || gameState !== "PLAYING" || levelTransitioning) {
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
    const oldLocalPivot = new THREE.Vector3((previousFlipped ? -pivotX : pivotX) * GRID_CELL_SIZE_X, 0, pivotZ * GRID_CELL_SIZE_Z);
    const nextLocalPivot = new THREE.Vector3((nextFlipped ? -pivotX : pivotX) * GRID_CELL_SIZE_X, 0, pivotZ * GRID_CELL_SIZE_Z);
    group.updateMatrixWorld(true);
    const worldPivot = group.localToWorld(oldLocalPivot);
    body.scale.x = nextFlipped ? -1 : 1;
    group.updateMatrixWorld(true);
    group.position.add(worldPivot.sub(group.localToWorld(nextLocalPivot)));

    const isStored = !placed.current && !dragging.current;
    let valid = !isStored || clampPieceToStorageSlot(group, definition, storagePosition, nextFlipped, visibleStorageBounds(), layoutMode);
    let nextAnchor: GridCell | null = null;
    if (valid && (placed.current || (dragging.current && snapAnchor.current))) {
      nextAnchor = worldToAnchor(group.position.x, group.position.z);
      valid = canPlace(definition.id, currentCells(nextAnchor, rotation.current, nextFlipped));
    }
    if (valid && placed.current && nextAnchor) {
      valid = placePiece(definition.id, currentCells(nextAnchor, rotation.current, nextFlipped));
      if (valid) {
        anchor.current = nextAnchor;
        onPlacementChange({ pieceId: definition.id, anchor: [nextAnchor.column, nextAnchor.row], rotation: rotation.current, flipped: nextFlipped });
      }
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
    onTransformChange({ id: definition.id, rotation: rotation.current, flipped: nextFlipped });
    motionTarget.current = null;
    invalidate();
  }, [canPlace, currentCells, definition, fixedPiece, flipRequest, gameState, invalidate, layoutMode, levelTransitioning, onPlacementChange, onTransformChange, placePiece, selected, storagePosition, visibleStorageBounds]);

  useEffect(() => {
    if (gameState !== "ANIMATING") return;
    const group = groupRef.current;
    const body = bodyRef.current;
    if (!group || !body) return;

    gsap.killTweensOf([group.position, group.rotation, group.scale, body.scale]);

    const timeline = gsap.timeline({ paused: true, onUpdate: invalidate });
    timeline.set(group.position, { x: solved.x, y: solved.y, z: solved.z }, 0);
    timeline.set(group.rotation, { x: 0, y: definition.solvedRotation * (Math.PI / 2), z: 0 }, 0);
    timeline.set(body.scale, { x: 1, y: 1, z: 1 }, 0);
    timeline.set(group.scale, { x: 1, y: 1, z: 1 }, 0);

    if (targetTransform.anchor) {
      const reconfigureStart = 0.82 + availablePieceCount * 0.25;
      timeline.to(group.scale, { x: 0.06, y: 0.06, z: 0.06, duration: 0.12, ease: "power2.in" }, reconfigureStart);
      timeline.to(group.position, { x: targetTransform.position.x, y: targetTransform.position.y + 0.55, z: targetTransform.position.z, duration: 0.18, ease: "power2.inOut" }, reconfigureStart + 0.12);
      timeline.to(group.rotation, { y: targetTransform.rotation * (Math.PI / 2), duration: 0.18, ease: "power2.inOut" }, reconfigureStart + 0.12);
      timeline.to(body.scale, { x: targetTransform.flipped ? -1 : 1, duration: 0.18, ease: "power2.inOut" }, reconfigureStart + 0.12);
      timeline.to(group.position, { y: targetTransform.position.y, duration: 0.18, ease: "power2.out" }, reconfigureStart + 0.3);
      timeline.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.18, ease: "power2.out" }, reconfigureStart + 0.3);
    } else {
      const laneY = 1.55;
      const glideStart = 0.7 + unboxOrder * 0.25;
      timeline.to(group.position, { y: laneY, duration: 0.18, ease: "power2.inOut" }, glideStart - 0.18);
      timeline.to(group.position, { x: targetTransform.position.x, z: targetTransform.position.z, duration: 0.2, ease: "power2.inOut" }, glideStart);
      timeline.to(group.rotation, { y: targetTransform.rotation * (Math.PI / 2), duration: 0.2, ease: "power2.inOut" }, glideStart);
      timeline.to(body.scale, { x: targetTransform.flipped ? -1 : 1, duration: 0.2, ease: "power2.inOut" }, glideStart);
      timeline.to(group.position, { y: targetTransform.position.y, duration: 0.12, ease: "power2.out" }, glideStart + 0.2);
      timeline.to(group.scale, { x: TRAY_SCALE, y: TRAY_SCALE, z: TRAY_SCALE, duration: 0.16, ease: "power2.out" }, glideStart + 0.14);
    }
    timeline.play(0);
    return () => { timeline.kill(); };
  }, [availablePieceCount, definition.solvedRotation, gameState, invalidate, solved, targetTransform, unboxOrder]);

  useEffect(() => {
    if (gameState !== "PLAYING") return;
    const group = groupRef.current;
    const body = bodyRef.current;
    if (!group || !body) return;
    gsap.killTweensOf([group.position, group.rotation, group.scale, body.scale]);
    const keepCurrentTrayTransform = preserveTrayTransform.current && !targetTransform.anchor && !levelTransitioning;
    dragging.current = false;
    snapAnchor.current = null;
    motionTarget.current = null;
    if (keepCurrentTrayTransform) {
      placed.current = false;
      anchor.current = null;
      const returnTarget = storagePositionForTransform(definition, targetTransform.position, rotation.current, flipped.current);
      gsap.to(group.position, {
        x: returnTarget.x,
        y: returnTarget.y,
        z: returnTarget.z,
        duration: 0.32,
        ease: "power2.inOut",
        onUpdate: invalidate,
        onComplete: () => { preserveTrayTransform.current = false; },
      });
      gsap.to(group.scale, { x: TRAY_SCALE, y: TRAY_SCALE, z: TRAY_SCALE, duration: 0.25, ease: "power2.out", onUpdate: invalidate });
      return;
    }
    preserveTrayTransform.current = false;
    const wasPlaced = placed.current;
    placed.current = Boolean(targetTransform.anchor);
    anchor.current = targetTransform.anchor;
    rotation.current = targetTransform.rotation;
    flipped.current = targetTransform.flipped;

    const applyExactTarget = () => {
      group.position.copy(targetTransform.position);
      group.rotation.set(0, targetTransform.rotation * (Math.PI / 2), 0);
      const targetScale = targetTransform.anchor ? 1 : TRAY_SCALE;
      group.scale.setScalar(targetScale);
      body.scale.x = targetTransform.flipped ? -1 : 1;
      invalidate();
    };

    const layoutChanged = previousLayoutMode.current !== layoutMode;
    previousLayoutMode.current = layoutMode;
    if (!levelTransitioning) {
      if (hinted && targetTransform.anchor && !wasPlaced) {
        group.rotation.set(0, targetTransform.rotation * (Math.PI / 2), 0);
        body.scale.x = targetTransform.flipped ? -1 : 1;
        const timeline = gsap.timeline({ onUpdate: invalidate, onComplete: applyExactTarget });
        timeline.to(group.position, { y: LIFT_Y + 0.35, duration: 0.18, ease: "power2.out" });
        timeline.to(group.position, { x: targetTransform.position.x, z: targetTransform.position.z, duration: 0.34, ease: "power2.inOut" });
        timeline.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.28, ease: "power2.inOut" }, "<");
        timeline.to(group.position, { y: targetTransform.position.y, duration: 0.18, ease: "power2.out" });
        return () => { timeline.kill(); };
      }
      if (layoutChanged && !targetTransform.anchor) {
        group.rotation.set(0, targetTransform.rotation * (Math.PI / 2), 0);
        body.scale.x = targetTransform.flipped ? -1 : 1;
        gsap.to(group.position, { x: targetTransform.position.x, y: targetTransform.position.y, z: targetTransform.position.z, duration: 0.45, ease: "power2.inOut", onUpdate: invalidate });
        gsap.to(group.scale, { x: TRAY_SCALE, y: TRAY_SCALE, z: TRAY_SCALE, duration: 0.45, ease: "power2.inOut", onUpdate: invalidate });
        return;
      }
      applyExactTarget();
      return;
    }

    const raisedY = targetTransform.position.y + 0.5;
    const timeline = gsap.timeline({ onUpdate: invalidate, onComplete: applyExactTarget });
    timeline.to(group.position, { y: group.position.y + 0.5, duration: 0.25, ease: "power2.inOut" }, 0);
    timeline.to(group.position, { x: targetTransform.position.x, z: targetTransform.position.z, y: raisedY, duration: 0.4, ease: "power2.inOut" }, 0.2);
    timeline.to(group.rotation, { x: 0, y: targetTransform.rotation * (Math.PI / 2), z: 0, duration: 0.4, ease: "power2.inOut" }, 0.2);
    timeline.to(body.scale, { x: targetTransform.flipped ? -1 : 1, duration: 0.4, ease: "power2.inOut" }, 0.2);
    timeline.to(group.scale, { x: targetTransform.anchor ? 1 : TRAY_SCALE, y: targetTransform.anchor ? 1 : TRAY_SCALE, z: targetTransform.anchor ? 1 : TRAY_SCALE, duration: 0.4, ease: "power2.inOut" }, 0.2);
    timeline.to(group.position, { y: targetTransform.position.y, duration: 0.2, ease: "power2.out" }, 0.55);
    return () => { timeline.kill(); };
  }, [definition, fixedPiece, gameState, hinted, invalidate, layoutMode, levelTransitioning, resetToken, targetTransform]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    if (gameState === "MENU") {
      group.position.copy(solved);
      group.rotation.y = definition.solvedRotation * (Math.PI / 2);
      group.scale.set(1, 1, 1);
      return;
    }

    if (gameState === "ANIMATING") return;

    if (dragging.current) {
      group.position.lerp(dragTarget.current, snapAnchor.current ? 0.34 : 0.48);
      group.scale.lerp(snapAnchor.current ? new THREE.Vector3(1.035, 1.035, 1.035) : new THREE.Vector3(1, 1, 1), 0.3);
      invalidate();
      return;
    }

    if (motionTarget.current) {
      group.position.lerp(motionTarget.current, 0.22);
      const targetScale = placed.current ? 1 : TRAY_SCALE;
      group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.3);
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
    if (gameState !== "PLAYING" || fixedPiece || !groupRef.current) return;
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    cursorCellIndex.current = Number(event.object.userData.cellIndex ?? cursorCellIndex.current);
    onSelect(definition.id);
    void triggerHaptic("selection");
    onTransformChange({ id: definition.id, rotation: rotation.current, flipped: flipped.current });
    if (levelTransitioning) return;
    const pointerTarget = event.nativeEvent.target as Element;
    pointerTarget.setPointerCapture(event.pointerId);
    (event.target as unknown as CaptureTarget).setPointerCapture(event.pointerId);
    pointerDownPoint.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
    pointerActive.current = true;
    pointerStartedPlaced.current = placed.current;
    snapAnchor.current = null;
    motionTarget.current = null;
    invalidate();
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    cursorCellIndex.current = Number(event.object.userData.cellIndex ?? cursorCellIndex.current);
    if (!pointerActive.current) return;
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    if (!dragging.current) {
      const deltaX = event.nativeEvent.clientX - pointerDownPoint.current.x;
      const deltaY = event.nativeEvent.clientY - pointerDownPoint.current.y;
      if (Math.hypot(deltaX, deltaY) < 4) return;
      if (pointerStartedPlaced.current) clearPiece(definition.id);
      placed.current = false;
      anchor.current = null;
      dragging.current = true;
      if (groupRef.current) {
        gsap.killTweensOf(groupRef.current.scale);
        gsap.to(groupRef.current.scale, { x: 1, y: 1, z: 1, duration: 0.18, ease: "power2.out", onUpdate: invalidate });
        dragTarget.current.copy(groupRef.current.position).setY(LIFT_Y);
      }
    }
    const hit = intersectDragPlane(event);
    if (!hit) return;
    const candidateAnchor = worldToAnchor(hit.x, hit.z);
    const candidateCells = currentCells(candidateAnchor);
    const valid = canPlace(definition.id, candidateCells);
    snapAnchor.current = valid ? candidateAnchor : null;
    if (valid) {
      dragTarget.current.copy(anchorToWorld(candidateAnchor)).setY(LIFT_Y);
    } else {
      const visible = visibleStorageBounds();
      const cells = transformedCells(definition.cells, rotation.current, flipped.current);
      const radius = 0.375;
      const minCellX = Math.min(...cells.map(([x]) => x * GRID_CELL_SIZE_X - radius));
      const maxCellX = Math.max(...cells.map(([x]) => x * GRID_CELL_SIZE_X + radius));
      const minCellZ = Math.min(...cells.map(([, z]) => z * GRID_CELL_SIZE_Z - radius));
      const maxCellZ = Math.max(...cells.map(([, z]) => z * GRID_CELL_SIZE_Z + radius));
      dragTarget.current.set(
        THREE.MathUtils.clamp(hit.x, visible.minX - minCellX, visible.maxX - maxCellX),
        LIFT_Y,
        THREE.MathUtils.clamp(hit.z, visible.minZ - minCellZ, visible.maxZ - maxCellZ),
      );
    }
    invalidate();
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!pointerActive.current) return;
    event.stopPropagation();
    const pointerTarget = event.nativeEvent.target as Element;
    if (pointerTarget.hasPointerCapture(event.pointerId)) pointerTarget.releasePointerCapture(event.pointerId);
    const raycastTarget = event.target as unknown as CaptureTarget;
    if (raycastTarget.hasPointerCapture(event.pointerId)) raycastTarget.releasePointerCapture(event.pointerId);
    pointerActive.current = false;

    const stationary = Math.hypot(
      event.nativeEvent.clientX - pointerDownPoint.current.x,
      event.nativeEvent.clientY - pointerDownPoint.current.y,
    ) < 4;
    const now = performance.now();
    const intentionalReset = stationary && now - lastStationaryClick.current <= 200;
    lastStationaryClick.current = stationary ? now : 0;
    if (intentionalReset) {
      dragging.current = false;
      clearPiece(definition.id);
      resetToTray(false);
      return;
    }

    if (!dragging.current) {
      // A tap/click selects the piece without changing its board placement.
      invalidate();
      return;
    }

    dragging.current = false;

    if (snapAnchor.current) {
      const targetCells = currentCells(snapAnchor.current);
      if (placePiece(definition.id, targetCells)) {
        void triggerHaptic("placement");
        placed.current = true;
        anchor.current = snapAnchor.current;
        const boardTarget = anchorToWorld(snapAnchor.current);
        motionTarget.current = null;
        onPlacementChange({ pieceId: definition.id, anchor: [snapAnchor.current.column, snapAnchor.current.row], rotation: rotation.current, flipped: flipped.current });
        if (groupRef.current) {
          gsap.killTweensOf([groupRef.current.position, groupRef.current.scale]);
          gsap.to(groupRef.current.position, { x: boardTarget.x, y: boardTarget.y, z: boardTarget.z, duration: 0.18, ease: "power2.out", onUpdate: invalidate });
          gsap.to(groupRef.current.scale, { x: 1, y: 1, z: 1, duration: 0.18, ease: "power2.out", onUpdate: invalidate });
        }
      }
    }

    if (!placed.current) {
      void triggerHaptic("invalid");
      resetToTray(false);
    }
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
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <group ref={bodyRef}>
        {!fixedPiece && !restoredPiece && (
          <mesh
            position={[hitArea.centerX, 0, hitArea.centerZ]}
            userData={{ selectionZone: true }}
          >
            <boxGeometry args={[hitArea.width, 0.8, hitArea.depth]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        )}
        {definition.cells.map(([x, z], index) => (
          <mesh key={`${x}-${z}-${index}`} position={[x * GRID_CELL_SIZE_X, 0, z * GRID_CELL_SIZE_Z]} userData={{ cellIndex: index }} castShadow receiveShadow>
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
      <mesh receiveShadow raycast={() => null}>
        <sphereGeometry args={[0.305, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#151718" roughness={0.62} side={THREE.BackSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
        <torusGeometry args={[0.31, 0.035, 8, 20]} />
        <meshStandardMaterial color="#45484a" roughness={0.4} metalness={0.08} />
      </mesh>
    </group>
  );
}

function SocketLattice() {
  const sockets = useMemo(() => Array.from({ length: COLUMNS * ROWS }, (_, index) => ({
    x: BOARD_MIN_X + (index % COLUMNS) * GRID_CELL_SIZE_X,
    z: BOARD_MIN_Z + Math.floor(index / COLUMNS) * GRID_CELL_SIZE_Z,
  })), []);

  return (
    <group>
      {Array.from({ length: ROWS + 1 }, (_, row) => (
        <RoundedBox key={`row-${row}`} args={[8.72, 0.11, 0.12]} radius={0.035} smoothness={3} position={[0, 0.22, (row - ROWS / 2) * GRID_CELL_SIZE_Z]} receiveShadow raycast={() => null}>
          <meshStandardMaterial color="#3d4042" roughness={0.45} metalness={0.08} />
        </RoundedBox>
      ))}
      {Array.from({ length: COLUMNS + 1 }, (_, column) => (
        <RoundedBox key={`column-${column}`} args={[0.12, 0.11, 4.04]} radius={0.035} smoothness={3} position={[(column - COLUMNS / 2) * GRID_CELL_SIZE_X, 0.22, 0]} receiveShadow raycast={() => null}>
          <meshStandardMaterial color="#3d4042" roughness={0.45} metalness={0.08} />
        </RoundedBox>
      ))}
      {sockets.map((socket) => <Socket key={`${socket.x}-${socket.z}`} {...socket} />)}
    </group>
  );
}

function ClamshellCase({ gameState, won, boardVersion }: { gameState: GameState; won: boolean; boardVersion: string }) {
  const caseRef = useRef<THREE.Group>(null);
  const lidRef = useRef<THREE.Group>(null);
  const lidMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const lidShadowMaterialRef = useRef<THREE.MeshDepthMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const puzzleCase = caseRef.current;
    if (!puzzleCase) return;
    gsap.killTweensOf(puzzleCase.position);
    puzzleCase.position.set(...BOARD_ANCHOR);
    invalidate();
  }, [boardVersion, invalidate]);

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

  useEffect(() => {
    const puzzleCase = caseRef.current;
    if (!won || !puzzleCase) return;
    const pulse = gsap.timeline({ onUpdate: invalidate })
      .to(puzzleCase.scale, { x: 1.025, y: 1.025, z: 1.025, duration: 0.2, ease: "power2.out", yoyo: true, repeat: 5 })
      .to(puzzleCase.scale, { x: 1, y: 1, z: 1, duration: 0.12 });
    return () => { pulse.kill(); };
  }, [invalidate, won]);

  return (
    <group ref={caseRef} position={BOARD_ANCHOR}>
      <RoundedBox args={[10.15, 0.28, 5.5]} radius={0.2} smoothness={6} position={[0, -0.12, 0]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#202324" roughness={0.32} metalness={0.08} />
      </RoundedBox>
      <RoundedBox args={[BOARD_WIDTH, 0.16, BOARD_DEPTH]} radius={0.12} smoothness={5} position={[0, 0.05, 0]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#303335" roughness={0.46} metalness={0.08} />
      </RoundedBox>
      <SocketLattice />
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.12, -2.72]} castShadow receiveShadow raycast={() => null}>
        <cylinderGeometry args={[0.11, 0.11, 9.8, 20]} />
        <meshStandardMaterial color="#1b1e1f" roughness={0.3} metalness={0.1} />
      </mesh>
      <group ref={lidRef} position={[0, 0.86, -2.72]} rotation={[CLOSED_LID_ANGLE, 0, 0]}>
        <RoundedBox args={[10.15, 0.1, 5.5]} radius={0.2} smoothness={6} position={[0, 0, -2.72]} castShadow receiveShadow raycast={() => null}>
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
  level,
  restoredPieces,
  resetToken,
  hintedPieceId,
  won,
  levelTransitioning,
  onSelectPiece,
  onAnimationComplete,
  onWin,
  onPlacementChange,
  onPlacementRemove,
  onTransformChange,
}: {
  gameState: GameState;
  startedAt: number;
  selectedPiece: string | null;
  rotationRequest: number;
  flipRequest: number;
  level: LevelConfig;
  restoredPieces: readonly StoredPiecePlacement[];
  resetToken: number;
  hintedPieceId: PieceId | null;
  won: boolean;
  levelTransitioning: boolean;
  onSelectPiece: (id: string | null) => void;
  onAnimationComplete: () => void;
  onWin: () => void;
  onPlacementChange: (placement: StoredPiecePlacement) => void;
  onPlacementRemove: (pieceId: PieceId) => void;
  onTransformChange: (state: PiecePreviewState) => void;
}) {
  const { camera, invalidate, size } = useThree();
  const gridRef = useRef<GridMatrix>(emptyGrid());
  const completionSent = useRef(false);
  const focus = useRef(new THREE.Vector3());
  const fixedById = useMemo(() => new Map(level.fixedPieces.map((piece) => [piece.pieceId, piece])), [level.fixedPieces]);
  const restoredById = useMemo(() => new Map(restoredPieces.map((piece) => [piece.pieceId, piece])), [restoredPieces]);
  const availablePieces = useMemo(() => PIECES.filter((piece) => !fixedById.has(piece.id) && !restoredById.has(piece.id)), [fixedById, restoredById]);
  const aspect = size.width / Math.max(1, size.height);
  const layoutMode: LayoutMode = Capacitor.isNativePlatform() || aspect >= 1 || size.width >= 768
    ? "LANDSCAPE_TABLET_DESKTOP"
    : "MOBILE_PORTRAIT";
  const storageById = useMemo(() => {
    const slots = layoutMode === "LANDSCAPE_TABLET_DESKTOP" ? LANDSCAPE_STORAGE_SLOTS : MOBILE_STORAGE_SLOTS;
    return new Map(availablePieces.map((piece, index) => [
      piece.id,
      centeredStoragePosition(piece, slots[index]),
    ]));
  }, [availablePieces, layoutMode]);

  useEffect(() => {
    if (selectedPiece && fixedById.has(selectedPiece as PieceId)) onSelectPiece(null);
  }, [fixedById, onSelectPiece, selectedPiece]);
  const cameraTargets = useMemo(() => {
    const cameraAspect = Math.max(0.45, size.width / Math.max(1, size.height));
    const halfFov = THREE.MathUtils.degToRad(15);
    const fitDistance = (width: number, height: number) => Math.max(
      height / (2 * Math.tan(halfFov)),
      width / (2 * Math.tan(halfFov) * cameraAspect),
    );
    const landscapeMenuWidth = 10.15 / 0.58;
    const menuDistance = layoutMode === "LANDSCAPE_TABLET_DESKTOP"
      ? fitDistance(landscapeMenuWidth, 9.5)
      : fitDistance(12.4, 7.2);
    const toolbarReserve = Math.min(0.22, 88 / Math.max(1, size.height));
    const landscape = layoutMode === "LANDSCAPE_TABLET_DESKTOP";
    const playFocus = new THREE.Vector3(0, PLAY_FOCUS.y, landscape ? BOARD_ANCHOR[2] : BOARD_ANCHOR[2] + 5.1);
    const portraitBoardWidth = 10.15 / 0.8;
    const fullSceneDistance = fitDistance(14.2, 18.2 / (1 - toolbarReserve));
    const playDistance = landscape
      ? fitDistance(28.5, 8.5 / (1 - toolbarReserve))
      : Math.max(portraitBoardWidth / (2 * Math.tan(halfFov) * cameraAspect), fullSceneDistance);
    return {
      menu: new THREE.Vector3(0, menuDistance * 0.93, MENU_FOCUS.z + menuDistance * 0.37),
      play: new THREE.Vector3(0, playDistance * 0.985, playFocus.z + playDistance * 0.17),
      playFocus,
    };
  }, [layoutMode, size.height, size.width]);

  const commitGrid = useCallback((nextGrid: GridMatrix) => {
    gridRef.current = nextGrid;
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
    if (cleared.every((row) => row.every((value) => value !== null))) onWin();
    return true;
  }, [commitGrid, onWin]);

  const clearPiece = useCallback((pieceId: string) => {
    commitGrid(gridRef.current.map((row) => row.map((value) => value === pieceId ? null : value)));
  }, [commitGrid]);

  useEffect(() => {
    const nextGrid = emptyGrid();
    for (const fixedPiece of level.fixedPieces) {
      const definition = PIECES.find((piece) => piece.id === fixedPiece.pieceId);
      if (!definition) continue;
      const cells = cellsForPlacement(
        fixedAnchorFor(definition, fixedPiece),
        definition.cells,
        fixedPiece.rotation,
        fixedPiece.flipped,
      );
      for (const { row, column } of cells) {
        if (row >= 0 && row < ROWS && column >= 0 && column < COLUMNS) nextGrid[row][column] = fixedPiece.pieceId;
      }
    }
    for (const restoredPiece of restoredPieces) {
      if (fixedById.has(restoredPiece.pieceId)) continue;
      const definition = PIECES.find((piece) => piece.id === restoredPiece.pieceId);
      if (!definition) continue;
      const anchor = { column: restoredPiece.anchor[0], row: restoredPiece.anchor[1] };
      for (const { row, column } of cellsForPlacement(anchor, definition.cells, restoredPiece.rotation, restoredPiece.flipped)) {
        if (row >= 0 && row < ROWS && column >= 0 && column < COLUMNS && nextGrid[row][column] === null) nextGrid[row][column] = restoredPiece.pieceId;
      }
    }
    commitGrid(nextGrid);
  }, [commitGrid, fixedById, level.fixedPieces, resetToken, restoredPieces]);

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
      focus.current.lerpVectors(MENU_FOCUS, cameraTargets.playFocus, progress);
      camera.lookAt(focus.current);
      invalidate();
      if (elapsed >= 4.15 && !completionSent.current) {
        completionSent.current = true;
        onAnimationComplete();
      }
    } else {
      camera.position.copy(cameraTargets.play);
      camera.lookAt(cameraTargets.playFocus);
    }
  });

  return (
    <>
      <color attach="background" args={["#dcd8d0"]} />
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
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={0.1}
        shadow-camera-far={60}
        shadow-bias={-0.00035}
        shadow-normalBias={0.018}
        shadow-radius={5}
      />
      <ClamshellCase gameState={gameState} won={won} boardVersion={`${level.id}:${resetToken}`} />
      {PIECES.map((definition) => (
        <Polyomino
          key={definition.id}
          definition={definition}
          gameState={gameState}
          selected={selectedPiece === definition.id}
          rotationRequest={rotationRequest}
          flipRequest={flipRequest}
          storagePosition={storageById.get(definition.id) ?? definition.trayPosition}
          fixedPiece={fixedById.get(definition.id) ?? null}
          restoredPiece={restoredById.get(definition.id) ?? null}
          layoutMode={layoutMode}
          resetToken={resetToken}
          hinted={hintedPieceId === definition.id}
          levelTransitioning={levelTransitioning}
          unboxOrder={availablePieces.findIndex((piece) => piece.id === definition.id)}
          availablePieceCount={availablePieces.length}
          onSelect={onSelectPiece}
          canPlace={canPlace}
          placePiece={placePiece}
          clearPiece={clearPiece}
          onPlacementChange={onPlacementChange}
          onPlacementRemove={onPlacementRemove}
          onTransformChange={onTransformChange}
        />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 3]} receiveShadow raycast={() => null}>
        <planeGeometry args={[42, 36]} />
        <meshStandardMaterial color="#dcd8d0" roughness={0.92} />
      </mesh>
    </>
  );
}

export function PuzzleScene() {
  const isNativeApp = Capacitor.isNativePlatform();
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [startedAt, setStartedAt] = useState(0);
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [piecePreview, setPiecePreview] = useState<PiecePreviewState | null>(null);
  const [rotationRequest, setRotationRequest] = useState(0);
  const [flipRequest, setFlipRequest] = useState(0);
  const [levelIndex, setLevelIndex] = useState(() => {
    const savedLevel = loadGameProgress().currentLevel;
    const index = LEVELS.findIndex((level) => level.id === savedLevel);
    return index >= 0 ? index : 0;
  });
  const [resetToken, setResetToken] = useState(0);
  const [won, setWon] = useState(false);
  const [hintRewarded, setHintRewarded] = useState(false);
  const [levelTransitioning, setLevelTransitioning] = useState(false);
  const [levelMenuOpen, setLevelMenuOpen] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [dprCap, setDprCap] = useState(1.5);
  const [hapticsEnabled, setHapticsEnabledState] = useState(getHapticsEnabled);
  const [hintFeedback, setHintFeedback] = useState<HintFeedback | null>(null);
  const [hintThinking, setHintThinking] = useState(false);
  const [hintedPieceId, setHintedPieceId] = useState<PieceId | null>(null);
  const [hintRefillOpen, setHintRefillOpen] = useState(false);
  const [progress, setProgress] = useState<GameProgress>(loadGameProgress);
  const levelTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintInFlight = useRef(false);
  const canvasElement = useRef<HTMLCanvasElement | null>(null);
  const currentLevelId = LEVELS[levelIndex].id;
  const selectedPieceLocked = selectedPiece
    ? LEVELS[levelIndex].fixedPieces.some((piece) => piece.pieceId === selectedPiece)
    : false;

  const selectPiece = useCallback((id: string | null) => {
    setSelectedPiece(id);
    if (!id) setPiecePreview(null);
  }, []);

  useEffect(() => {
    const updateDprCap = () => {
      const isTouchDevice = navigator.maxTouchPoints > 0;
      setDprCap(isTouchDevice || window.innerWidth < 1024 ? 1.5 : 2);
    };
    updateDprCap();
    window.addEventListener("resize", updateDprCap);
    return () => window.removeEventListener("resize", updateDprCap);
  }, []);

  const updateProgress = useCallback((updater: (previous: GameProgress) => GameProgress) => {
    setProgress((previous) => {
      const next = updater(previous);
      saveGameProgress(next);
      return next;
    });
  }, []);

  const savePlacement = useCallback((placement: StoredPiecePlacement) => {
    setHintFeedback(null);
    updateProgress((previous) => {
      const placements = previous.activeBoardState[String(currentLevelId)] ?? [];
      return {
        ...previous,
        activeBoardState: {
          ...previous.activeBoardState,
          [String(currentLevelId)]: [...placements.filter((item) => item.pieceId !== placement.pieceId), placement],
        },
      };
    });
  }, [currentLevelId, updateProgress]);

  const removePlacement = useCallback((pieceId: PieceId) => {
    setHintFeedback(null);
    updateProgress((previous) => {
      const levelKey = String(currentLevelId);
      const placements = previous.activeBoardState[levelKey];
      if (!placements?.some((item) => item.pieceId === pieceId)) return previous;
      return {
        ...previous,
        activeBoardState: {
          ...previous.activeBoardState,
          [levelKey]: placements.filter((item) => item.pieceId !== pieceId),
        },
      };
    });
  }, [currentLevelId, updateProgress]);

  const beginLevelTransition = useCallback(() => {
    if (levelTransitionTimer.current) clearTimeout(levelTransitionTimer.current);
    setLevelTransitioning(true);
    levelTransitionTimer.current = setTimeout(() => {
      setLevelTransitioning(false);
      levelTransitionTimer.current = null;
      canvasElement.current?.focus({ preventScroll: true });
    }, LEVEL_TRANSITION_MS);
  }, []);

  useEffect(() => () => {
    if (levelTransitionTimer.current) clearTimeout(levelTransitionTimer.current);
  }, []);

  useEffect(() => {
    if (!hintFeedback) return;
    const timer = setTimeout(() => setHintFeedback(null), 4200);
    return () => clearTimeout(timer);
  }, [hintFeedback]);

  const requestRotation = useCallback(() => {
    if (gameState === "PLAYING" && selectedPiece && !selectedPieceLocked && !levelTransitioning) setRotationRequest((request) => request + 1);
  }, [gameState, levelTransitioning, selectedPiece, selectedPieceLocked]);

  const requestFlip = useCallback(() => {
    if (gameState === "PLAYING" && selectedPiece && !selectedPieceLocked && !levelTransitioning) setFlipRequest((request) => request + 1);
  }, [gameState, levelTransitioning, selectedPiece, selectedPieceLocked]);

  const toggleHaptics = useCallback(() => {
    const enabled = !hapticsEnabled;
    setHapticsEnabled(enabled);
    setHapticsEnabledState(enabled);
    if (enabled) void triggerHaptic("selection");
  }, [hapticsEnabled]);

  const resetLevel = useCallback(() => {
    beginLevelTransition();
    selectPiece(null);
    setWon(false);
    setHintRewarded(false);
    setHintFeedback(null);
    setHintedPieceId(null);
    updateProgress((previous) => ({
      ...previous,
      activeBoardState: { ...previous.activeBoardState, [String(currentLevelId)]: [] },
    }));
    setResetToken((token) => token + 1);
  }, [beginLevelTransition, currentLevelId, selectPiece, updateProgress]);

  const requestHint = useCallback(async () => {
    if (gameState !== "PLAYING" || won || levelTransitioning || hintInFlight.current) return;
    if (progress.hintsRemaining <= 0) {
      setHintRefillOpen(true);
      return;
    }
    hintInFlight.current = true;
    setHintThinking(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const currentLevel = LEVELS[levelIndex];
    const levelKey = String(currentLevel.id);
    const currentPlacements = progress.activeBoardState[levelKey] ?? [];
    const fixedPlacements: StoredPiecePlacement[] = currentLevel.fixedPieces.map((fixedPiece) => {
      const definition = PIECES.find((piece) => piece.id === fixedPiece.pieceId)!;
      const anchor = fixedAnchorFor(definition, fixedPiece);
      return {
        pieceId: fixedPiece.pieceId,
        anchor: [anchor.column, anchor.row],
        rotation: fixedPiece.rotation,
        flipped: fixedPiece.flipped,
      };
    });
    const solve = (placements: readonly StoredPiecePlacement[]) => solvePuzzle({
      pieces: PIECES,
      fixedPlacements,
      playerPlacements: placements,
      columns: COLUMNS,
      rows: ROWS,
    });

    let compatiblePlacements = currentPlacements;
    let solution = solve(compatiblePlacements);
    const removed: PieceId[] = [];
    while (!solution && compatiblePlacements.length > 0) {
      const blocker = compatiblePlacements[compatiblePlacements.length - 1];
      removed.push(blocker.pieceId);
      compatiblePlacements = compatiblePlacements.slice(0, -1);
      solution = solve(compatiblePlacements);
    }
    if (!solution || solution.length === 0) {
      setHintFeedback({
        message: solution ? "Every piece is already placed." : "No compatible completion was found.",
        piece: null,
      });
      hintInFlight.current = false;
      setHintThinking(false);
      return;
    }

    const hint = solution[0];
    setHintedPieceId(hint.pieceId);
    selectPiece(hint.pieceId);
    setPiecePreview({ id: hint.pieceId, rotation: hint.rotation, flipped: hint.flipped });
    updateProgress((previous) => ({
      ...previous,
      hintsRemaining: Math.max(0, previous.hintsRemaining - 1),
      totalHintsUsed: previous.totalHintsUsed + 1,
      hintsUsedByLevel: {
        ...previous.hintsUsedByLevel,
        [levelKey]: (previous.hintsUsedByLevel[levelKey] ?? 0) + 1,
      },
      activeBoardState: {
        ...previous.activeBoardState,
        [levelKey]: [...compatiblePlacements, hint],
      },
    }));
    setHintFeedback({
      message: removed.length > 0 ? "Adjusted the board and placed a piece for you." : "A correct piece was placed.",
      piece: { id: hint.pieceId, rotation: hint.rotation, flipped: hint.flipped },
    });
    void triggerHaptic("placement");
    if (solution.length === 1) {
      setTimeout(() => {
        setHintRewarded(false);
        setWon(true);
        void triggerHaptic("completion");
        updateProgress((previous) => ({
          ...previous,
          completedLevels: previous.completedLevels.includes(currentLevel.id)
            ? previous.completedLevels
            : [...previous.completedLevels, currentLevel.id],
        }));
      }, 720);
    }
    hintInFlight.current = false;
    setHintThinking(false);
  }, [gameState, levelIndex, levelTransitioning, progress.activeBoardState, progress.hintsRemaining, selectPiece, updateProgress, won]);

  const selectLevel = useCallback((nextIndex: number) => {
    setLevelMenuOpen(false);
    setHintFeedback(null);
    setHintedPieceId(null);
    beginLevelTransition();
    setLevelIndex(nextIndex);
    selectPiece(null);
    setWon(false);
    setHintRewarded(false);
    updateProgress((previous) => ({ ...previous, currentLevel: LEVELS[nextIndex].id }));
    setResetToken((token) => token + 1);
    requestAnimationFrame(() => canvasElement.current?.focus({ preventScroll: true }));
  }, [beginLevelTransition, selectPiece, updateProgress]);

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
    <div className={`webgl-stage${levelTransitioning ? " webgl-stage--transitioning" : ""}`}>
      <Canvas
        key={canvasKey}
        frameloop="demand"
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ position: [0, 18, 22], fov: 30, near: 0.1, far: 100 }}
        dpr={[1, dprCap]}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          canvasElement.current = gl.domElement;
          gl.domElement.tabIndex = 0;
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
          level={LEVELS[levelIndex]}
          restoredPieces={progress.activeBoardState[String(currentLevelId)] ?? EMPTY_STORED_PLACEMENTS}
          resetToken={resetToken}
          hintedPieceId={hintedPieceId}
          won={won}
          levelTransitioning={levelTransitioning}
          onSelectPiece={selectPiece}
          onAnimationComplete={() => setGameState("PLAYING")}
          onWin={() => {
            void triggerHaptic("completion");
            const earnedHint = !progress.completedLevels.includes(currentLevelId)
              && (progress.hintsUsedByLevel[String(currentLevelId)] ?? 0) === 0;
            setHintRewarded(earnedHint);
            setWon(true);
            updateProgress((previous) => {
              const firstCompletion = !previous.completedLevels.includes(currentLevelId);
              const noHintsUsed = (previous.hintsUsedByLevel[String(currentLevelId)] ?? 0) === 0;
              return {
                ...previous,
                completedLevels: firstCompletion
                  ? [...previous.completedLevels, currentLevelId]
                  : previous.completedLevels,
                hintsRemaining: firstCompletion && noHintsUsed
                  ? previous.hintsRemaining + 1
                  : previous.hintsRemaining,
              };
            });
          }}
          onPlacementChange={savePlacement}
          onPlacementRemove={removePlacement}
          onTransformChange={setPiecePreview}
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

      <div
        className={`level-toolbar${gameState === "PLAYING" ? " level-toolbar--visible" : ""}`}
        aria-hidden={gameState !== "PLAYING"}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setLevelMenuOpen(false);
        }}
      >
        {isNativeApp && (
          <button
            type="button"
            className={`haptic-toggle-btn${hapticsEnabled ? "" : " is-muted"}`}
            onClick={toggleHaptics}
            aria-label="Toggle Haptics"
            aria-pressed={hapticsEnabled}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="7" y="2" width="10" height="20" rx="2" />
              {hapticsEnabled ? (
                <>
                  <path d="M2 8v8" />
                  <path d="M22 8v8" />
                </>
              ) : (
                <line x1="2" y1="2" x2="22" y2="22" />
              )}
            </svg>
          </button>
        )}
        <span className="level-toolbar__label">Challenge</span>
        <div className="level-picker">
          <button
            type="button"
            className="level-picker__trigger"
            disabled={levelTransitioning}
            aria-haspopup="listbox"
            aria-expanded={levelMenuOpen}
            onClick={() => setLevelMenuOpen((open) => !open)}
          >
            <span>{progress.completedLevels.includes(currentLevelId) ? "✓ " : ""}{LEVELS[levelIndex].name}</span>
            <span className="level-picker__chevron" aria-hidden="true">
              <svg viewBox="0 0 12 8" focusable="false">
                <path d="M1 1.25 6 6.5l5-5.25" />
              </svg>
            </span>
          </button>
          {levelMenuOpen && (
            <div className="level-picker__menu" role="listbox" aria-label="Challenge level">
              {LEVELS.map((level, index) => (
                <button
                  key={level.id}
                  type="button"
                  role="option"
                  aria-selected={index === levelIndex}
                  className="level-picker__option"
                  onClick={() => selectLevel(index)}
                >
                  <span aria-hidden="true" className="level-picker__check">{progress.completedLevels.includes(level.id) ? "✓" : ""}</span>
                  <span>{level.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="level-toolbar__reset" disabled={levelTransitioning} onClick={resetLevel}>Reset Level</button>
        <button type="button" className={`level-toolbar__hint ${progress.hintsRemaining === 0 ? "level-toolbar__hint--empty" : ""}`} disabled={levelTransitioning || won || hintThinking} onClick={requestHint} aria-label={progress.hintsRemaining === 0 ? "Get more hints" : "Use a hint"}>
          <span>{hintThinking ? "Thinking…" : progress.hintsRemaining === 0 ? "Get hints" : "Hint"}</span>
          {!hintThinking && progress.hintsRemaining > 0 && <span className="level-toolbar__hint-count" aria-label={`${progress.hintsRemaining} hints remaining`}>{progress.hintsRemaining}</span>}
        </button>
      </div>

      {hintFeedback && !won && (
        <div className="hint-toast" role="status">
          {hintFeedback.piece && <span className="hint-toast__preview"><PiecePreview state={hintFeedback.piece} /></span>}
          <span>{hintFeedback.message}</span>
        </div>
      )}

      <div className={`bottom-hud${gameState === "PLAYING" && !won ? " bottom-hud--visible" : ""}`} aria-hidden={gameState !== "PLAYING" || won}>
        <div className={`piece-tools${gameState === "PLAYING" ? " piece-tools--visible" : ""}`}>
          <div className="piece-preview"><PiecePreview state={piecePreview} /></div>
          <button type="button" disabled={!selectedPiece || selectedPieceLocked || levelTransitioning} onClick={requestRotation} aria-label={`Rotate piece ${selectedPiece ?? ""} counter-clockwise`}>↺ Rotate</button>
          <button type="button" disabled={!selectedPiece || selectedPieceLocked || levelTransitioning} onClick={requestFlip} aria-label={`Flip piece ${selectedPiece ?? ""} horizontally`}>↔ Flip</button>
        </div>
        <p aria-hidden={gameState !== "PLAYING"} className={`play-hint${gameState === "PLAYING" ? " play-hint--visible" : ""}`}>
          <span className="play-hint__key">Drag</span><span>Move</span>
          <span className="play-hint__separator play-hint__desktop-only">·</span>
          <span className="play-hint__key play-hint__desktop-only">R / Space</span><span className="play-hint__desktop-only">Rotate</span>
          <span className="play-hint__separator play-hint__desktop-only">·</span>
          <span className="play-hint__key play-hint__desktop-only">F</span><span className="play-hint__desktop-only">Flip</span>
          <span className="play-hint__separator">·</span>
          <span className="play-hint__key play-hint__desktop-only">Double-click / Double-tap</span>
          <span className="play-hint__key play-hint__mobile-only">Double-tap</span><span>Reset</span>
        </p>
      </div>

      {won && (
        <div className="victory-overlay" role="dialog" aria-modal="true" aria-labelledby="victory-title">
          <div className="victory-card">
            <span className="victory-card__spark">✦</span>
            <p className="victory-card__eyebrow">Board complete</p>
            <h2 id="victory-title">Puzzle solved!</h2>
            {hintRewarded && (
              <div className="victory-card__reward" role="status">
                <span aria-hidden="true">✦</span>
                <span><strong>+1 Hint</strong> awarded for solving without help</span>
              </div>
            )}
            <button type="button" onClick={() => {
              if (levelIndex < LEVELS.length - 1) selectLevel(levelIndex + 1);
              else resetLevel();
            }}>{levelIndex < LEVELS.length - 1 ? "Next Level" : "Play Again"}</button>
          </div>
        </div>
      )}

      {hintRefillOpen && !won && (
        <div className="hint-refill-overlay" role="dialog" aria-modal="true" aria-labelledby="hint-refill-title">
          <div className="hint-refill-card">
            <span className="hint-refill-card__icon" aria-hidden="true">✦</span>
            <p className="hint-refill-card__eyebrow">Hints remaining: 0</p>
            <h2 id="hint-refill-title">Need another nudge?</h2>
            <p>Purchasing will come later. For now, refill your testing balance.</p>
            <div className="hint-refill-card__actions">
              <button type="button" className="hint-refill-card__cancel" onClick={() => setHintRefillOpen(false)}>Not Now</button>
              <button type="button" className="hint-refill-card__refill" onClick={() => {
                updateProgress((previous) => ({ ...previous, hintsRemaining: previous.hintsRemaining + INITIAL_HINT_BALANCE }));
                setHintRefillOpen(false);
              }}>Refill 5 Hints</button>
            </div>
          </div>
        </div>
      )}

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
