import { ORIGINAL_LEVELS } from "./level-packs/original";
import { WEEK_01_LEVELS } from "./level-packs/week-01";
import type { LevelConfig } from "./level-types";

export type { FixedPiece, LevelConfig, PieceId } from "./level-types";

/** Permanent non-numbered ID so adding packs never moves Free Play save data. */
export const FREE_PLAY_LEVEL: LevelConfig = { id: 0, name: "Free Play", fixedPieces: [] };

export const LEVEL_PACKS = [
  { id: "original", name: "Original", levels: ORIGINAL_LEVELS },
  { id: "week-01", name: "Pack 1", levels: WEEK_01_LEVELS },
] as const;

export const LEVELS: readonly LevelConfig[] = [
  ...LEVEL_PACKS.flatMap((pack) => pack.levels),
  FREE_PLAY_LEVEL,
];
