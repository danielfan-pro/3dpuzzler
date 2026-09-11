import type { PieceId } from "@/data/levels";

export type StoredPiecePlacement = {
  pieceId: PieceId;
  anchor: [number, number];
  rotation: number;
  flipped: boolean;
};

export type GameProgress = {
  completedLevels: number[];
  currentLevel: number;
  activeBoardState: Record<string, StoredPiecePlacement[]>;
  hintsRemaining: number;
  totalHintsUsed: number;
  hintsUsedByLevel: Record<string, number>;
};

const STORAGE_KEY = "3dpuzzler-progress-v1";
export const INITIAL_HINT_BALANCE = 5;
const DEFAULT_PROGRESS: GameProgress = {
  completedLevels: [],
  currentLevel: 1,
  activeBoardState: {},
  hintsRemaining: INITIAL_HINT_BALANCE,
  totalHintsUsed: 0,
  hintsUsedByLevel: {},
};

function numberRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, count]) => (
    Number.isFinite(count) ? [[key, Math.max(0, Math.floor(Number(count)))]] : []
  )));
}

export function loadGameProgress(): GameProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<GameProgress> | null;
    if (!parsed) return DEFAULT_PROGRESS;
    return {
      completedLevels: Array.isArray(parsed.completedLevels) ? parsed.completedLevels.filter(Number.isFinite) : [],
      currentLevel: Number.isFinite(parsed.currentLevel) ? Number(parsed.currentLevel) : 1,
      activeBoardState: parsed.activeBoardState && typeof parsed.activeBoardState === "object" ? parsed.activeBoardState : {},
      hintsRemaining: Number.isFinite(parsed.hintsRemaining)
        ? Math.max(0, Math.floor(Number(parsed.hintsRemaining)))
        : INITIAL_HINT_BALANCE,
      totalHintsUsed: Number.isFinite(parsed.totalHintsUsed)
        ? Math.max(0, Math.floor(Number(parsed.totalHintsUsed)))
        : 0,
      hintsUsedByLevel: numberRecord(parsed.hintsUsedByLevel),
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveGameProgress(progress: GameProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
