export type PieceId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

export type FixedPiece = {
  pieceId: PieceId;
  /** Anchor used by the board placement system, [column, row]. */
  position: readonly [number, number];
  /** Clockwise quarter turns. */
  rotation: number;
  flipped: boolean;
};

export type LevelConfig = {
  id: number;
  name: string;
  fixedPieces: readonly FixedPiece[];
};
