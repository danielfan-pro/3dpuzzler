import type { PieceId } from "@/data/levels";
import type { StoredPiecePlacement } from "@/lib/gameStorage";

export type SolverPiece = {
  id: PieceId;
  cells: readonly (readonly [number, number])[];
};

type Candidate = StoredPiecePlacement & { cellIndexes: number[] };

function rotateCell([x, row]: readonly [number, number], turns: number): [number, number] {
  let nextX = x;
  let nextRow = row;
  for (let turn = 0; turn < turns; turn += 1) [nextX, nextRow] = [nextRow, -nextX];
  return [nextX, nextRow];
}

function transformedCells(piece: SolverPiece, rotation: number, flipped: boolean) {
  return piece.cells.map(([x, row]) => rotateCell([flipped ? -x : x, row], rotation));
}

function placementCellIndexes(piece: SolverPiece, placement: StoredPiecePlacement, columns: number, rows: number) {
  const cells = transformedCells(piece, placement.rotation, placement.flipped).map(([x, row]) => ({
    column: placement.anchor[0] + x,
    row: placement.anchor[1] + row,
  }));
  if (cells.some((cell) => cell.column < 0 || cell.column >= columns || cell.row < 0 || cell.row >= rows)) return null;
  return cells.map((cell) => cell.row * columns + cell.column);
}

function candidatesFor(piece: SolverPiece, columns: number, rows: number): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (let flippedIndex = 0; flippedIndex < 2; flippedIndex += 1) {
    const flipped = Boolean(flippedIndex);
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const cells = transformedCells(piece, rotation, flipped);
      const minX = Math.min(...cells.map(([x]) => x));
      const maxX = Math.max(...cells.map(([x]) => x));
      const minRow = Math.min(...cells.map(([, row]) => row));
      const maxRow = Math.max(...cells.map(([, row]) => row));
      for (let row = -minRow; row < rows - maxRow; row += 1) {
        for (let column = -minX; column < columns - maxX; column += 1) {
          const cellIndexes = cells.map(([x, cellRow]) => (row + cellRow) * columns + column + x).sort((a, b) => a - b);
          const key = cellIndexes.join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ pieceId: piece.id, anchor: [column, row], rotation, flipped, cellIndexes });
        }
      }
    }
  }
  return candidates;
}

export function solvePuzzle({
  pieces,
  fixedPlacements,
  playerPlacements,
  columns,
  rows,
}: {
  pieces: readonly SolverPiece[];
  fixedPlacements: readonly StoredPiecePlacement[];
  playerPlacements: readonly StoredPiecePlacement[];
  columns: number;
  rows: number;
}): StoredPiecePlacement[] | null {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const occupied = new Uint8Array(columns * rows);
  const constrainedIds = new Set<PieceId>();
  for (const placement of [...fixedPlacements, ...playerPlacements]) {
    const piece = byId.get(placement.pieceId);
    if (!piece || constrainedIds.has(placement.pieceId)) return null;
    const indexes = placementCellIndexes(piece, placement, columns, rows);
    if (!indexes || indexes.some((index) => occupied[index])) return null;
    indexes.forEach((index) => { occupied[index] = 1; });
    constrainedIds.add(placement.pieceId);
  }

  const remainingPieces = pieces.filter((piece) => !constrainedIds.has(piece.id));
  const candidatesByPiece = new Map(remainingPieces.map((piece) => [piece.id, candidatesFor(piece, columns, rows)]));
  const remainingIds = new Set(remainingPieces.map((piece) => piece.id));
  const solution: Candidate[] = [];

  const search = (): boolean => {
    if (remainingIds.size === 0) return occupied.every((value) => value === 1);
    let best: Candidate[] | null = null;
    for (let cellIndex = 0; cellIndex < occupied.length; cellIndex += 1) {
      if (occupied[cellIndex]) continue;
      const options: Candidate[] = [];
      for (const pieceId of remainingIds) {
        for (const candidate of candidatesByPiece.get(pieceId) ?? []) {
          if (candidate.cellIndexes.includes(cellIndex) && candidate.cellIndexes.every((index) => !occupied[index])) options.push(candidate);
        }
      }
      if (options.length === 0) return false;
      if (!best || options.length < best.length) best = options;
    }
    if (!best) return false;
    for (const candidate of best) {
      remainingIds.delete(candidate.pieceId);
      candidate.cellIndexes.forEach((index) => { occupied[index] = 1; });
      solution.push(candidate);
      if (search()) return true;
      solution.pop();
      candidate.cellIndexes.forEach((index) => { occupied[index] = 0; });
      remainingIds.add(candidate.pieceId);
    }
    return false;
  };

  if (!search()) return null;
  return solution.map(({ pieceId, anchor, rotation, flipped }) => ({ pieceId, anchor, rotation, flipped }));
}
