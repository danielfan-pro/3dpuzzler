export type PieceId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";
export type FixedPiece = { pieceId: PieceId; /** Top-left occupied socket, [column, row]. */ position: readonly [number, number]; /** Clockwise quarter turns. */ rotation: number; flipped: boolean };
export type LevelConfig = { id: number; name: string; fixedPieces: readonly FixedPiece[] };

export const LEVELS: readonly LevelConfig[] = [
  { id: 1, name: "Level 1", fixedPieces: [
    {pieceId:"A",position:[1,2],rotation:2,flipped:true},{pieceId:"D",position:[5,0],rotation:0,flipped:false},{pieceId:"E",position:[1,0],rotation:0,flipped:false},{pieceId:"F",position:[8,0],rotation:0,flipped:false},{pieceId:"G",position:[5,1],rotation:0,flipped:false},{pieceId:"H",position:[0,2],rotation:1,flipped:false},{pieceId:"J",position:[0,0],rotation:2,flipped:false},{pieceId:"K",position:[3,0],rotation:1,flipped:true},{pieceId:"L",position:[3,3],rotation:0,flipped:true},
  ]},
  { id: 2, name: "Level 2", fixedPieces: [
    {pieceId:"C",position:[6,0],rotation:0,flipped:false},{pieceId:"D",position:[9,2],rotation:3,flipped:false},{pieceId:"E",position:[5,2],rotation:1,flipped:false},{pieceId:"G",position:[7,2],rotation:2,flipped:false},{pieceId:"H",position:[0,0],rotation:0,flipped:false},{pieceId:"I",position:[8,0],rotation:0,flipped:false},{pieceId:"J",position:[4,0],rotation:0,flipped:false},{pieceId:"K",position:[3,0],rotation:1,flipped:false},{pieceId:"L",position:[6,3],rotation:0,flipped:true},
  ]},
  { id: 3, name: "Level 3", fixedPieces: [
    {pieceId:"A",position:[0,0],rotation:1,flipped:false},{pieceId:"B",position:[8,1],rotation:2,flipped:false},{pieceId:"D",position:[8,3],rotation:2,flipped:false},{pieceId:"E",position:[4,3],rotation:2,flipped:false},{pieceId:"F",position:[8,0],rotation:0,flipped:true},{pieceId:"H",position:[5,0],rotation:3,flipped:false},{pieceId:"I",position:[2,0],rotation:2,flipped:true},{pieceId:"K",position:[4,1],rotation:1,flipped:true},{pieceId:"L",position:[6,1],rotation:3,flipped:true},
  ]},
  { id: 4, name: "Level 4", fixedPieces: [
    {pieceId:"A",position:[0,3],rotation:2,flipped:true},{pieceId:"B",position:[4,0],rotation:3,flipped:false},{pieceId:"C",position:[3,1],rotation:3,flipped:false},{pieceId:"E",position:[0,0],rotation:0,flipped:false},{pieceId:"F",position:[5,2],rotation:3,flipped:false},{pieceId:"G",position:[9,0],rotation:1,flipped:false},{pieceId:"H",position:[0,1],rotation:1,flipped:false},{pieceId:"J",position:[1,0],rotation:3,flipped:false},{pieceId:"L",position:[6,0],rotation:2,flipped:false},
  ]},
  { id: 5, name: "Level 5", fixedPieces: [
    {pieceId:"A",position:[2,3],rotation:2,flipped:true},{pieceId:"C",position:[0,0],rotation:0,flipped:false},{pieceId:"F",position:[5,0],rotation:2,flipped:true},{pieceId:"G",position:[0,3],rotation:3,flipped:false},{pieceId:"H",position:[4,2],rotation:3,flipped:false},{pieceId:"J",position:[0,1],rotation:2,flipped:false},{pieceId:"K",position:[2,2],rotation:0,flipped:true},{pieceId:"L",position:[2,0],rotation:0,flipped:true},
  ]},
  { id: 6, name: "Level 6", fixedPieces: [
    {pieceId:"B",position:[5,2],rotation:1,flipped:false},{pieceId:"C",position:[0,0],rotation:0,flipped:true},{pieceId:"D",position:[4,2],rotation:1,flipped:false},{pieceId:"G",position:[5,0],rotation:0,flipped:false},{pieceId:"H",position:[0,2],rotation:1,flipped:false},{pieceId:"I",position:[0,1],rotation:1,flipped:false},{pieceId:"J",position:[3,0],rotation:1,flipped:false},{pieceId:"K",position:[2,2],rotation:1,flipped:false},
  ]},
  { id: 7, name: "Level 7", fixedPieces: [
    {pieceId:"A",position:[0,3],rotation:2,flipped:true},{pieceId:"B",position:[1,1],rotation:3,flipped:true},{pieceId:"C",position:[4,1],rotation:1,flipped:false},{pieceId:"D",position:[3,0],rotation:0,flipped:false},{pieceId:"E",position:[5,3],rotation:2,flipped:false},{pieceId:"F",position:[0,0],rotation:0,flipped:true},{pieceId:"G",position:[0,2],rotation:2,flipped:false},{pieceId:"I",position:[5,0],rotation:1,flipped:true},
  ]},
  { id: 8, name: "Level 8", fixedPieces: [
    {pieceId:"C",position:[0,0],rotation:1,flipped:true},{pieceId:"E",position:[1,0],rotation:0,flipped:false},{pieceId:"F",position:[3,1],rotation:1,flipped:false},{pieceId:"G",position:[4,0],rotation:1,flipped:false},{pieceId:"H",position:[2,2],rotation:1,flipped:false},{pieceId:"I",position:[0,2],rotation:1,flipped:true},{pieceId:"K",position:[4,3],rotation:0,flipped:true},
  ]},
  { id: 9, name: "Level 9", fixedPieces: [
    {pieceId:"C",position:[0,0],rotation:0,flipped:true},{pieceId:"D",position:[0,3],rotation:2,flipped:false},{pieceId:"E",position:[3,0],rotation:3,flipped:false},{pieceId:"F",position:[3,3],rotation:2,flipped:false},{pieceId:"G",position:[0,1],rotation:2,flipped:false},{pieceId:"I",position:[1,2],rotation:2,flipped:false},
  ]},
  { id: 10, name: "Level 10", fixedPieces: [
    {pieceId:"A",position:[4,0],rotation:1,flipped:false},{pieceId:"B",position:[8,1],rotation:1,flipped:true},{pieceId:"G",position:[2,0],rotation:1,flipped:false},{pieceId:"I",position:[9,2],rotation:1,flipped:true},{pieceId:"J",position:[5,0],rotation:1,flipped:false},{pieceId:"L",position:[7,0],rotation:2,flipped:true},
  ]},
  { id: 11, name: "Level 11", fixedPieces: [
    {pieceId:"D",position:[0,0],rotation:0,flipped:false},{pieceId:"E",position:[5,0],rotation:0,flipped:false},{pieceId:"F",position:[3,0],rotation:2,flipped:false},{pieceId:"J",position:[6,0],rotation:3,flipped:false},{pieceId:"K",position:[4,2],rotation:0,flipped:true},
  ]},
  { id: 12, name: "Level 12", fixedPieces: [
    {pieceId:"C",position:[4,0],rotation:0,flipped:false},{pieceId:"D",position:[6,1],rotation:1,flipped:false},{pieceId:"E",position:[0,0],rotation:1,flipped:false},{pieceId:"F",position:[1,0],rotation:0,flipped:false},
  ]},
  { id: 13, name: "Level 13", fixedPieces: [
    {pieceId:"E",position:[5,2],rotation:0,flipped:false},{pieceId:"F",position:[6,0],rotation:0,flipped:true},{pieceId:"G",position:[9,0],rotation:1,flipped:false},
  ]},
  { id: 14, name: "Level 14", fixedPieces: [
    {pieceId:"G",position:[6,0],rotation:1,flipped:false},{pieceId:"I",position:[8,0],rotation:2,flipped:true},{pieceId:"K",position:[5,2],rotation:0,flipped:false},
  ]},
  { id: 15, name: "Level 15", fixedPieces: [
    {pieceId:"G",position:[5,1],rotation:0,flipped:false},{pieceId:"K",position:[4,0],rotation:0,flipped:false},{pieceId:"L",position:[1,0],rotation:0,flipped:true},
  ]},
  { id: 16, name: "Level 16", fixedPieces: [
    {pieceId:"A",position:[3,1],rotation:2,flipped:true},{pieceId:"C",position:[7,0],rotation:0,flipped:false},{pieceId:"F",position:[4,0],rotation:0,flipped:true},
  ]},
  { id: 17, name: "Free Play", fixedPieces: [] },
];
