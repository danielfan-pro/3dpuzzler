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
};

const STORAGE_KEY = "3dpuzzler-progress-v1";
const DEFAULT_PROGRESS: GameProgress = { completedLevels: [], currentLevel: 1, activeBoardState: {} };

export function loadGameProgress(): GameProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<GameProgress> | null;
    if (!parsed) return DEFAULT_PROGRESS;
    return {
      completedLevels: Array.isArray(parsed.completedLevels) ? parsed.completedLevels.filter(Number.isFinite) : [],
      currentLevel: Number.isFinite(parsed.currentLevel) ? Number(parsed.currentLevel) : 1,
      activeBoardState: parsed.activeBoardState && typeof parsed.activeBoardState === "object" ? parsed.activeBoardState : {},
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveGameProgress(progress: GameProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
