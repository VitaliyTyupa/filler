export type PlayerId = 1 | 2;

export interface GameSettings {
  cols: number;
  rows: number;
  paletteSize: number;
}

export interface GameState {
  cols: number;
  rows: number;
  paletteSize: number;
  owner: Uint8Array;
  color: Uint8Array;
  playerColor: Uint8Array;
  currentPlayer: PlayerId;
  score: Uint16Array;
}

export interface GameResult {
  winner: PlayerId | 0;
  score1: number;
  score2: number;
}
