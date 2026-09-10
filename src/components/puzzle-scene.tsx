"use client";

import { RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";

type Point3 = readonly [number, number, number];
type GameState = "MENU" | "ANIMATING" | "PLAYING";

const COLUMNS = 11;
const ROWS = 5;
const CELL = 0.78;
const BOARD_WIDTH = 9.55;
const BOARD_DEPTH = 4.9;
const SOCKET_Y = 0.37;
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.54);
const MENU_CAMERA = new THREE.Vector3(9.8, 6.4, 14.8);
const PLAY_CAMERA = new THREE.Vector3(8.8, 11.8, 12.8);
const MENU_FOCUS = new THREE.Vector3(0, 0.25, 0.35);
const PLAY_FOCUS = new THREE.Vector3(0, 0.25, 0.15);
const CLOSED_LID_ANGLE = Math.PI;
const OPEN_LID_ANGLE = 1.02;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const PIECES: Array<{
  id: string;
  color: string;
  position: Point3;
  packedPosition: Point3;
  rotation?: Point3;
  cells: ReadonlyArray<readonly [number, number]>;
}> = [
  { id: "coral", color: "#ff4128", packedPosition: [-2.75, -0.25, -0.55], position: [-5.35, 0.55, -0.8], rotation: [0, -0.1, 0], cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: "aqua", color: "#10c6c5", packedPosition: [-0.45, -0.25, 0.55], position: [-5.4, 0.55, 1.1], rotation: [0, 0.12, 0], cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: "yellow", color: "#f6bd17", packedPosition: [1.45, -0.25, -0.75], position: [0.55, 0.55, 3.56], rotation: [0, 0.06, 0], cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
];

function PlasticMaterial({ color }: { color: string }) {
  return <meshPhysicalMaterial color={color} roughness={0.14} metalness={0.01} clearcoat={1} clearcoatRoughness={0.1} />;
}

function Polyomino({
  id,
  color,
  cells,
  initialPosition,
  packedPosition,
  rotation = [0, 0, 0],
  gameState,
  startedAt,
}: {
  id: string;
  color: string;
  cells: ReadonlyArray<readonly [number, number]>;
  initialPosition: Point3;
  packedPosition: Point3;
  rotation?: Point3;
  gameState: GameState;
  startedAt: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const dragOffset = useRef(new THREE.Vector3());
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    if (!groupRef.current) return;
    if (gameState === "MENU") {
      groupRef.current.position.set(...packedPosition);
      return;
    }
    if (gameState === "ANIMATING") {
      const elapsed = (performance.now() - startedAt) / 1000;
      const progress = easeInOut((elapsed - 1.15) / 1.55);
      groupRef.current.position.lerpVectors(
        new THREE.Vector3(...packedPosition),
        new THREE.Vector3(...initialPosition),
        progress,
      );
      invalidate();
      return;
    }
    if (!dragging.current && groupRef.current.position.y !== initialPosition[1]) {
      groupRef.current.position.set(...initialPosition);
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
    const hit = intersectDragPlane(event);
    if (hit) dragOffset.current.set(groupRef.current.position.x - hit.x, 0, groupRef.current.position.z - hit.z);
    dragging.current = true;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !groupRef.current) return;
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    const hit = intersectDragPlane(event);
    if (hit) {
      groupRef.current.position.set(hit.x + dragOffset.current.x, 0.55, hit.z + dragOffset.current.z);
      invalidate();
    }
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const pointerTarget = event.nativeEvent.target as Element;
    if (pointerTarget.hasPointerCapture(event.pointerId)) pointerTarget.releasePointerCapture(event.pointerId);
    dragging.current = false;
  };

  return (
    <group
      ref={groupRef}
      name={`piece-${id}`}
      position={packedPosition}
      rotation={rotation}
      onPointerOver={(event) => {
        if (gameState === "PLAYING") event.stopPropagation();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {cells.map(([x, z], index) => (
        <mesh key={`${x}-${z}-${index}`} position={[x * 0.61, 0, z * 0.61]} castShadow receiveShadow>
          <sphereGeometry args={[0.375, 24, 16]} />
          <PlasticMaterial color={color} />
        </mesh>
      ))}
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
  const sockets = Array.from({ length: COLUMNS * ROWS }, (_, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      x: (column - (COLUMNS - 1) / 2) * CELL,
      z: (row - (ROWS - 1) / 2) * CELL,
    };
  });

  return (
    <group>
      {Array.from({ length: ROWS + 1 }, (_, row) => (
        <RoundedBox key={`row-${row}`} args={[8.72, 0.15, 0.14]} radius={0.04} smoothness={3} position={[0, 0.31, (row - ROWS / 2) * CELL]} receiveShadow>
          <meshStandardMaterial color="#3d4042" roughness={0.45} metalness={0.08} />
        </RoundedBox>
      ))}
      {Array.from({ length: COLUMNS + 1 }, (_, column) => (
        <RoundedBox key={`column-${column}`} args={[0.14, 0.15, 4.04]} radius={0.04} smoothness={3} position={[(column - COLUMNS / 2) * CELL, 0.31, 0]} receiveShadow>
          <meshStandardMaterial color="#3d4042" roughness={0.45} metalness={0.08} />
        </RoundedBox>
      ))}
      {sockets.map((socket) => <Socket key={`${socket.x}-${socket.z}`} {...socket} />)}
    </group>
  );
}

function Channel({ position, size }: { position: Point3; size: Point3 }) {
  return (
    <group position={position}>
      <RoundedBox args={[...size]} radius={0.24} smoothness={5} castShadow receiveShadow>
        <meshStandardMaterial color="#282b2c" roughness={0.38} metalness={0.06} />
      </RoundedBox>
      <RoundedBox args={[size[0] - 0.34, 0.1, size[2] - 0.34]} radius={0.16} smoothness={4} position={[0, size[1] / 2 + 0.015, 0]} receiveShadow>
        <meshStandardMaterial color="#111314" roughness={0.72} />
      </RoundedBox>
    </group>
  );
}

function ClamshellCase({ gameState, startedAt }: { gameState: GameState; startedAt: number }) {
  const lidRef = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    if (!lidRef.current) return;
    if (gameState === "MENU") {
      lidRef.current.rotation.x = CLOSED_LID_ANGLE;
      return;
    }
    if (gameState === "ANIMATING") {
      const elapsed = (performance.now() - startedAt) / 1000;
      const progress = easeInOut(elapsed / 1.55);
      lidRef.current.rotation.x = THREE.MathUtils.lerp(CLOSED_LID_ANGLE, OPEN_LID_ANGLE, progress);
      invalidate();
      return;
    }
    lidRef.current.rotation.x = OPEN_LID_ANGLE;
  });

  return (
    <group>
      <RoundedBox args={[12.15, 0.65, 7.3]} radius={0.42} smoothness={7} position={[-0.5, -0.17, 0.42]} castShadow receiveShadow>
        <meshStandardMaterial color="#202324" roughness={0.32} metalness={0.08} />
      </RoundedBox>
      <RoundedBox args={[BOARD_WIDTH, 0.32, BOARD_DEPTH]} radius={0.22} smoothness={5} position={[0, 0.04, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#303335" roughness={0.46} metalness={0.08} />
      </RoundedBox>
      <SocketLattice />
      <Channel position={[-5.35, 0.06, 0]} size={[1.55, 0.36, 5.05]} />
      <Channel position={[0.55, 0.06, 3.52]} size={[10.25, 0.36, 1.35]} />
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.12, -2.78]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.22, 11.5, 32]} />
        <meshStandardMaterial color="#1b1e1f" roughness={0.3} metalness={0.1} />
      </mesh>
      <group ref={lidRef} position={[0, 0.05, -2.88]} rotation={[CLOSED_LID_ANGLE, 0, 0]}>
        <RoundedBox args={[12.15, 0.24, 7.15]} radius={0.38} smoothness={6} position={[0, 0, -3.45]} castShadow receiveShadow>
          <meshPhysicalMaterial color="#596063" roughness={0.24} metalness={0.06} clearcoat={0.45} />
        </RoundedBox>
        <RoundedBox args={[11.25, 0.09, 6.25]} radius={0.28} smoothness={5} position={[0, 0.16, -3.45]} receiveShadow>
          <meshStandardMaterial color="#6a7275" roughness={0.4} metalness={0.08} />
        </RoundedBox>
      </group>
    </group>
  );
}

function Scene({ gameState, startedAt, onAnimationComplete }: {
  gameState: GameState;
  startedAt: number;
  onAnimationComplete: () => void;
}) {
  const { camera, invalidate } = useThree();
  const completionSent = useRef(false);
  const focus = useRef(new THREE.Vector3());

  useFrame(() => {
    if (gameState === "MENU") {
      completionSent.current = false;
      camera.position.copy(MENU_CAMERA);
      camera.lookAt(MENU_FOCUS);
      return;
    }

    if (gameState === "ANIMATING") {
      const elapsed = (performance.now() - startedAt) / 1000;
      const cameraProgress = easeInOut((elapsed - 0.3) / 3.4);
      camera.position.lerpVectors(MENU_CAMERA, PLAY_CAMERA, cameraProgress);
      focus.current.lerpVectors(MENU_FOCUS, PLAY_FOCUS, cameraProgress);
      camera.lookAt(focus.current);
      invalidate();

      if (elapsed >= 4.05 && !completionSent.current) {
        completionSent.current = true;
        onAnimationComplete();
      }
      return;
    }

    camera.position.copy(PLAY_CAMERA);
    camera.lookAt(PLAY_FOCUS);
  });

  return (
    <>
      <color attach="background" args={["#e6dfd2"]} />
      <fog attach="fog" args={["#e6dfd2", 18, 31]} />
      <ambientLight intensity={0.58} color="#dce7ff" />
      <directionalLight
        position={[-5, 10, 7]}
        intensity={3.4}
        color="#fff3dc"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.00035}
        shadow-normalBias={0.018}
      />
      <ClamshellCase gameState={gameState} startedAt={startedAt} />
      {PIECES.map(({ position, ...piece }) => (
        <Polyomino key={piece.id} {...piece} initialPosition={position} gameState={gameState} startedAt={startedAt} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.51, 0]} receiveShadow>
        <planeGeometry args={[38, 32]} />
        <meshStandardMaterial color="#e6dfd2" roughness={0.92} />
      </mesh>
      <hemisphereLight args={["#f7f2e9", "#363a3b", 0.7]} />
    </>
  );
}

export function PuzzleScene() {
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [startedAt, setStartedAt] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  return (
    <div className="webgl-stage">
      <Canvas
        key={canvasKey}
        frameloop="demand"
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ position: MENU_CAMERA.toArray() as [number, number, number], fov: 37, near: 0.1, far: 70 }}
        dpr={1}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMappingExposure = 1.08;
          gl.domElement.addEventListener(
            "webglcontextlost",
            (event) => {
              event.preventDefault();
              setContextLost(true);
            },
            { once: true },
          );
        }}
      >
        <Scene gameState={gameState} startedAt={startedAt} onAnimationComplete={() => setGameState("PLAYING")} />
      </Canvas>
      {gameState !== "PLAYING" && (
        <div className={`game-start${gameState === "MENU" ? "" : " game-start--hidden"}`} aria-hidden={gameState !== "MENU"}>
          <button
            type="button"
            disabled={gameState !== "MENU"}
            onClick={() => {
              setStartedAt(performance.now());
              setGameState("ANIMATING");
            }}
          >
            Play
          </button>
        </div>
      )}
      <p aria-hidden={gameState !== "PLAYING"} className={`play-hint${gameState === "PLAYING" ? " play-hint--visible" : ""}`}>Drag pieces into the board</p>
      {contextLost && (
        <div className="webgl-recovery" role="alert">
          <p>The 3D view paused to protect graphics memory.</p>
          <button
            type="button"
            onClick={() => {
              setContextLost(false);
              setCanvasKey((key) => key + 1);
            }}
          >
            Restore 3D view
          </button>
        </div>
      )}
    </div>
  );
}
