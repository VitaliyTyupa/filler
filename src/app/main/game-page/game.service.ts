import { Injectable } from '@angular/core';

export const DEFAULT_PALETTE = ['#2c7be5', '#6f42c1', '#f6c343', '#e63757', '#00d97e', '#39afd1', '#fd7e14'];

export type GameConfig = {
  cols: number;
  rows: number;
  colors: Uint8Array;
};

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

  createGameConfig(params: { cols: number; rows: number; paletteSize: number }): GameConfig {
    const totalCells = params.cols * params.rows;
    const colors = new Uint8Array(totalCells);

    for (let index = 0; index < totalCells; index += 1) {
      colors[index] = Math.floor(Math.random() * params.paletteSize);
    }

    return {
      cols: params.cols,
      rows: params.rows,
      colors
    };
  }
}
