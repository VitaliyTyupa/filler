import { Injectable } from '@angular/core';
import {
  applyMove,
  generateInitialState,
  getValidMoves,
  getWinner,
  isGameOver,
  pickCpuMove,
  type GameResult,
  type GameState,
  type PlayerId
} from '@filler/shared/engine';

export const DEFAULT_PALETTE = ['#2c7be5', '#6f42c1', '#f6c343', '#e63757', '#00d97e', '#39afd1', '#fd7e14'];

@Injectable({ providedIn: 'root' })
export class GameService {
  getUsers(): Array<{ id: number; name: string }> {
    return [
      { id: 1, name: 'Player 1' },
      { id: 2, name: 'Player 2' }
    ];
  }

  getPalette(): string[] {
    return [...DEFAULT_PALETTE];
  }

  generateInitialState(params: { cols: number; rows: number; paletteSize: number }): GameState {
    return generateInitialState(params);
  }

  getValidMoves(state: GameState, playerId: PlayerId): boolean[] {
    return getValidMoves(state, playerId);
  }

  isGameOver(state: GameState): boolean {
    return isGameOver(state);
  }

  getWinner(state: GameState): GameResult {
    return getWinner(state);
  }

  pickCpuMove(state: GameState, cpuPlayerId: PlayerId): number {
    return pickCpuMove(state, cpuPlayerId);
  }

  applyMove(state: GameState, playerId: PlayerId, colorIndex: number): GameState {
    return applyMove(state, playerId, colorIndex);
  }
}

export type { GameResult, GameState, PlayerId };
