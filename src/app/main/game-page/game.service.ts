import { Injectable } from '@angular/core';

export type GameConfig = {
  cols: number;
  rows: number;
  colors: Uint8Array;
};

@Injectable({ providedIn: 'root' })
export class GameService {
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
