import { ORIGINAL_LEVELS } from "../src/data/level-packs/original.ts";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const COLUMNS = 11;
const ROWS = 5;
const GENERATOR_VERSION = 1;
const DEFAULT_PLAN = [6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 1];

export const PIECES = [
  { id: "A", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]] },
  { id: "B", cells: [[0, 0], [1, 0], [2, 0], [1, -1], [0, 1]] },
  { id: "C", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]] },
  { id: "D", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]] },
  { id: "E", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: "F", cells: [[0, 0], [1, 0], [2, 0], [1, 1], [2, 1]] },
  { id: "G", cells: [[0, 0], [1, 0], [1, -1]] },
  { id: "H", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]] },
  { id: "I", cells: [[0, 0], [1, 0], [2, 0], [2, -1]] },
  { id: "J", cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
  { id: "K", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { id: "L", cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]] },
];

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function rotate([x, row], turns) {
  for (let turn = 0; turn < turns; turn += 1) [x, row] = [row, -x];
  return [x, row];
}

function transformed(piece, rotation, flipped) {
  return piece.cells.map(([x, row]) => rotate([flipped ? -x : x, row], rotation));
}

function candidatesFor(piece) {
  const candidates = [];
  const seen = new Set();
  for (const flipped of [false, true]) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const shape = transformed(piece, rotation, flipped);
      const minX = Math.min(...shape.map(([x]) => x));
      const maxX = Math.max(...shape.map(([x]) => x));
      const minRow = Math.min(...shape.map(([, row]) => row));
      const maxRow = Math.max(...shape.map(([, row]) => row));
      for (let row = -minRow; row < ROWS - maxRow; row += 1) {
        for (let column = -minX; column < COLUMNS - maxX; column += 1) {
          const cells = shape.map(([x, y]) => [column + x, row + y]);
          const indexes = cells.map(([x, y]) => y * COLUMNS + x).sort((a, b) => a - b);
          const key = indexes.join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ pieceId: piece.id, anchor: [column, row], position: [column + minX, row + minRow], rotation, flipped, cells, indexes });
        }
      }
    }
  }
  return candidates;
}

const CANDIDATES = new Map(PIECES.map((piece) => [piece.id, candidatesFor(piece)]));

export function searchSolution(fixed, random = null, nodeLimit = 2_000_000) {
  const occupied = new Uint8Array(COLUMNS * ROWS);
  const remaining = new Set(PIECES.map(({ id }) => id));
  const solution = [];
  let nodes = 0;
  for (const placement of fixed) {
    const candidate = (CANDIDATES.get(placement.pieceId) ?? []).find((item) => (
      item.position[0] === placement.position[0] && item.position[1] === placement.position[1]
      && item.rotation === placement.rotation && item.flipped === placement.flipped
    ));
    if (!candidate || !remaining.has(candidate.pieceId) || candidate.indexes.some((index) => occupied[index])) return null;
    candidate.indexes.forEach((index) => { occupied[index] = 1; });
    remaining.delete(candidate.pieceId);
    solution.push(candidate);
  }

  const visit = () => {
    nodes += 1;
    if (nodes > nodeLimit) return false;
    if (remaining.size === 0) return occupied.every(Boolean);
    let options = null;
    for (let cell = 0; cell < occupied.length; cell += 1) {
      if (occupied[cell]) continue;
      const available = [];
      for (const id of remaining) {
        for (const candidate of CANDIDATES.get(id) ?? []) {
          if (candidate.indexes.includes(cell) && candidate.indexes.every((index) => !occupied[index])) available.push(candidate);
        }
      }
      if (!available.length) return false;
      if (!options || available.length < options.length) options = available;
    }
    const ordered = random ? shuffled(options, random) : options;
    for (const candidate of ordered) {
      remaining.delete(candidate.pieceId);
      candidate.indexes.forEach((index) => { occupied[index] = 1; });
      solution.push(candidate);
      if (visit()) return true;
      solution.pop();
      candidate.indexes.forEach((index) => { occupied[index] = 0; });
      remaining.add(candidate.pieceId);
    }
    return false;
  };

  return visit() ? { placements: solution, nodes } : null;
}

export function cellsForFixed(level) {
  return level.fixedPieces.map((fixed) => {
    const candidate = (CANDIDATES.get(fixed.pieceId) ?? []).find((item) => (
      item.position[0] === fixed.position[0] && item.position[1] === fixed.position[1]
      && item.rotation === fixed.rotation && item.flipped === fixed.flipped
    ));
    if (!candidate) throw new Error(`Invalid placement for ${level.name}/${fixed.pieceId}`);
    return { id: fixed.pieceId, cells: candidate.cells };
  });
}

export function fingerprint(items) {
  const transforms = [
    ([x, y]) => [x, y],
    ([x, y]) => [COLUMNS - 1 - x, ROWS - 1 - y],
    ([x, y]) => [COLUMNS - 1 - x, y],
    ([x, y]) => [x, ROWS - 1 - y],
  ];
  return transforms.map((transformCell) => items
    .map(({ id, cells }) => `${id}:${cells.map(transformCell).map(([x, y]) => y * COLUMNS + x).sort((a, b) => a - b).join(".")}`)
    .sort()
    .join("|")).sort()[0];
}

function publicPlacement(candidate) {
  return { pieceId: candidate.pieceId, position: candidate.position, rotation: candidate.rotation, flipped: candidate.flipped };
}

export function fingerprintHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function existingMetadata() {
  const directory = new URL("../src/data/level-packs/", import.meta.url);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".metadata.json"))
    .flatMap((name) => JSON.parse(readFileSync(new URL(name, directory), "utf8")));
}

function generate() {
  const startId = Number(argument("start", "17"));
  const pack = argument("pack", "week-01");
  const seed = Number(argument("seed", String(0x3d202601)));
  const plan = argument("plan", DEFAULT_PLAN.join(",")).split(",").map(Number);
  if (!Number.isInteger(startId) || plan.some((count) => !Number.isInteger(count) || count < 1 || count > PIECES.length)) {
    throw new Error("Use an integer --start and a comma-separated --plan containing values from 1 to 12");
  }

  const priorMetadata = existingMetadata().filter(({ levelId }) => levelId < startId);
  const random = mulberry32(seed);
  const usedPresetHashes = new Set([
    ...ORIGINAL_LEVELS.map((level) => fingerprintHash(fingerprint(cellsForFixed(level)))),
    ...priorMetadata.map(({ presetFingerprint }) => presetFingerprint),
  ]);
  const usedSolutionHashes = new Set(priorMetadata.map(({ solutionFingerprint }) => solutionFingerprint));
  const generated = [];

  for (const presetCount of plan) {
    let accepted = null;
    for (let attempt = 0; attempt < 10_000 && !accepted; attempt += 1) {
      const full = searchSolution([], random);
      if (!full) continue;
      const solutionFingerprint = fingerprint(full.placements.map(({ pieceId: id, cells }) => ({ id, cells })));
      const solutionHash = fingerprintHash(solutionFingerprint);
      if (usedSolutionHashes.has(solutionHash)) continue;
      const chosen = shuffled(full.placements, random).slice(0, presetCount).sort((a, b) => a.pieceId.localeCompare(b.pieceId));
      const fixedPieces = chosen.map(publicPlacement);
      const presetFingerprint = fingerprint(chosen.map(({ pieceId: id, cells }) => ({ id, cells })));
      const presetHash = fingerprintHash(presetFingerprint);
      if (usedPresetHashes.has(presetHash)) continue;
      const rating = searchSolution(fixedPieces);
      if (!rating) continue;
      accepted = { fixedPieces, presetHash, solutionHash, solverNodes: rating.nodes };
    }
    if (!accepted) throw new Error(`Could not generate a unique level with ${presetCount} presets`);
    usedPresetHashes.add(accepted.presetHash);
    usedSolutionHashes.add(accepted.solutionHash);
    generated.push(accepted);
  }

  const levels = generated.map((level, index) => ({ id: startId + index, name: `Level ${startId + index}`, fixedPieces: level.fixedPieces }));
  const metadata = generated.map((level, index) => ({
    levelId: startId + index,
    pack,
    presetCount: level.fixedPieces.length,
    presetFingerprint: level.presetHash,
    solutionFingerprint: level.solutionHash,
    solverNodes: level.solverNodes,
    seed,
    generatorVersion: GENERATOR_VERSION,
  }));
  console.log(JSON.stringify({ levels, metadata }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) generate();
