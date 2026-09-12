import type { PieceId } from "@/data/levels";

export type StoredPiecePlacement = {
  pieceId: PieceId;
  anchor: [number, number];
  rotation: number;
  flipped: boolean;
};

export type GameProgress = {
  levelCatalogVersion: number;
  completedLevels: number[];
  currentLevel: number;
  activeBoardState: Record<string, StoredPiecePlacement[]>;
  hintsRemaining: number;
  totalHintsUsed: number;
  hintsUsedByLevel: Record<string, number>;
};

const STORAGE_KEY = "3dpuzzler-progress-v1";
const LEVEL_CATALOG_VERSION = 4;
export const INITIAL_HINT_BALANCE = 5;
const DEFAULT_PROGRESS: GameProgress = {
  levelCatalogVersion: LEVEL_CATALOG_VERSION,
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

function migrateRecord<T>(record: Record<string, T>, migrateLevelId: (id: number) => number) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => {
    const numericId = Number(key);
    return [Number.isFinite(numericId) ? String(migrateLevelId(numericId)) : key, value];
  }));
}

export function loadGameProgress(): GameProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<GameProgress> | null;
    if (!parsed) return DEFAULT_PROGRESS;
    // Preserve identities from earlier catalogs. Free Play now permanently uses
    // ID 0; catalog v2 also needs its former Level 30 moved forward to 31.
    const catalogVersion = parsed.levelCatalogVersion ?? 1;
    const migrateLevelId = (id: number) => {
      if (catalogVersion <= 1 && id === 17) return 0;
      if (catalogVersion === 2 && id === 30) return 31;
      if (catalogVersion === 2 && id === 31) return 0;
      if (catalogVersion === 3 && id === 33) return 0;
      return id;
    };
    const activeBoardState = migrateRecord(
      parsed.activeBoardState && typeof parsed.activeBoardState === "object" ? parsed.activeBoardState : {},
      migrateLevelId,
    );
    const hintsUsedByLevel = migrateRecord(numberRecord(parsed.hintsUsedByLevel), migrateLevelId);
    const completedLevels = Array.isArray(parsed.completedLevels)
      ? [...new Set(parsed.completedLevels.filter(Number.isFinite).map(migrateLevelId))]
      : [];
    return {
      levelCatalogVersion: LEVEL_CATALOG_VERSION,
      completedLevels,
      currentLevel: Number.isFinite(parsed.currentLevel) ? migrateLevelId(Number(parsed.currentLevel)) : 1,
      activeBoardState,
      hintsRemaining: Number.isFinite(parsed.hintsRemaining)
        ? Math.max(0, Math.floor(Number(parsed.hintsRemaining)))
        : INITIAL_HINT_BALANCE,
      totalHintsUsed: Number.isFinite(parsed.totalHintsUsed)
        ? Math.max(0, Math.floor(Number(parsed.totalHintsUsed)))
        : 0,
      hintsUsedByLevel,
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveGameProgress(progress: GameProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
