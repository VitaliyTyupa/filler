export type PlayerId = 1 | 2;
export type CpuDifficulty = 'standard' | 'master' | 'champion' | 'ultra';

export interface GameState {
  cols: number;
  rows: number;
  paletteSize: number;
  owner: Uint8Array;
  color: Uint8Array;
  effect: Uint8Array;
  playerColor: Uint8Array;
  score: Uint16Array;
  currentPlayer: PlayerId;
  turn: number;
  cpuPlayerId?: PlayerId;
  cpuDifficulty?: CpuDifficulty;
}

export interface CreateGameParams {
  cols: number;
  rows: number;
  paletteSize: number;
  seed: number;
  cpuPlayerId?: PlayerId;
  cpuDifficulty?: CpuDifficulty;
}

export interface MoveInput {
  playerId: PlayerId;
  colorIndex: number;
  expectedTurn?: number;
}

export interface GameDiff {
  changedCells: Uint32Array;
  owner: Uint8Array;
  color: Uint8Array;
  nextTurn: PlayerId;
  turn: number;
}

export interface ApplyMoveResult {
  state: GameState;
  diff: GameDiff | null;
}

export interface GameWinner {
  winner: 1 | 2 | 0;
  score1: number;
  score2: number;
}
