import { Injectable } from '@angular/core';

export const DEFAULT_PALETTE = ['#2c7be5', '#6f42c1', '#f6c343', '#e63757', '#00d97e', '#39afd1', '#fd7e14'];

export type PlayerId = 1 | 2;

export interface GameConfig {
  cols: number;
  rows: number;
  paletteSize: number;
  colors: Uint8Array; // base board colors (indices)
}

export interface GameState {
  cols: number;
  rows: number;
  paletteSize: number;

  owner: Uint8Array; // 0 = none, 1..2 = player
  color: Uint8Array; // current cell color index (mutates as players recolor territory)
  playerColor: Uint8Array; // index by playerId (size 3; ignore 0)
  currentPlayer: PlayerId;

  score: Uint16Array; // size 3; score[p] = ownedCount
}

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
    const config: GameConfig = {
      cols: params.cols,
      rows: params.rows,
      paletteSize: params.paletteSize,
      colors: new Uint8Array(params.cols * params.rows)
    };

    let attempts = 0;
    let isValid = false;

    while (attempts < 50 && !isValid) {
      this.fillRandomColors(config.colors, config.paletteSize);
      attempts += 1;
      isValid = this.validateInitialState(config);
    }

    if (!isValid) {
      console.warn('Unable to generate valid initial state after max attempts');
    }

    const owner = new Uint8Array(config.cols * config.rows);
    const color = new Uint8Array(config.colors);

    const tlIndex = 0;
    const brIndex = config.cols * config.rows - 1;
    const playerColor = new Uint8Array(3);

    playerColor[1] = color[tlIndex];
    playerColor[2] = color[brIndex];

    this.floodFill(color, owner, config.cols, config.rows, tlIndex, 1);
    this.floodFill(color, owner, config.cols, config.rows, brIndex, 2);

    const score = this.calculateScore(owner);

    return {
      cols: config.cols,
      rows: config.rows,
      paletteSize: config.paletteSize,
      owner,
      color,
      playerColor,
      currentPlayer: 1,
      score
    };
  }

  getValidMoves(state: GameState, playerId: PlayerId): boolean[] {
    const moves = new Array<boolean>(state.paletteSize).fill(true);

    const enemyId: PlayerId = playerId === 1 ? 2 : 1;
    const playerCurrentColor = state.playerColor[playerId];
    const enemyCurrentColor = state.playerColor[enemyId];

    if (playerCurrentColor !== undefined) {
      moves[playerCurrentColor] = false;
    }

    if (this.hasContact(state) && enemyCurrentColor !== undefined) {
      moves[enemyCurrentColor] = false;
    }

    return moves;
  }

  pickCpuMove(state: GameState, cpuPlayerId: PlayerId): number {
    const validMoves = this.getValidMoves(state, cpuPlayerId);
    const adjacentColors = new Set<number>();

    for (let index = 0; index < state.owner.length; index += 1) {
      if (state.owner[index] !== cpuPlayerId) {
        continue;
      }

      const neighbors = this.getNeighbors(index, state.cols, state.rows);

      neighbors.forEach((neighbor) => {
        if (state.owner[neighbor] !== cpuPlayerId) {
          adjacentColors.add(state.color[neighbor]);
        }
      });
    }

    const candidateColors: number[] = [];
    adjacentColors.forEach((colorIndex) => {
      if (validMoves[colorIndex]) {
        candidateColors.push(colorIndex);
      }
    });

    const availableMoves: number[] = candidateColors.length ? candidateColors : [];

    if (!availableMoves.length) {
      for (let colorIndex = 0; colorIndex < validMoves.length; colorIndex += 1) {
        if (validMoves[colorIndex]) {
          availableMoves.push(colorIndex);
        }
      }
    }

    if (!availableMoves.length) {
      return state.playerColor[cpuPlayerId];
    }

    const randomIndex = Math.floor(Math.random() * availableMoves.length);
    return availableMoves[randomIndex];
  }

  hasContact(state: GameState): boolean {
    const { cols, rows, owner } = state;
    const totalCells = cols * rows;

    for (let index = 0; index < totalCells; index += 1) {
      const cellOwner = owner[index];

      if (cellOwner !== 1) {
        continue;
      }

      const row = Math.floor(index / cols);
      const col = index % cols;

      const neighbors = [
        index - 1,
        index + 1,
        index - cols,
        index + cols
      ];

      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= totalCells) {
          continue;
        }

        const neighborRow = Math.floor(neighbor / cols);
        const neighborCol = neighbor % cols;

        if (Math.abs(neighborRow - row) + Math.abs(neighborCol - col) !== 1) {
          continue;
        }

        if (owner[neighbor] === 2) {
          return true;
        }
      }
    }

    return false;
  }

  applyMove(state: GameState, playerId: PlayerId, colorIndex: number): GameState {
    if (playerId !== state.currentPlayer) {
      return state;
    }

    const validMoves = this.getValidMoves(state, playerId);
    if (!validMoves[colorIndex]) {
      return state;
    }

    const owner = new Uint8Array(state.owner);
    const color = new Uint8Array(state.color);
    const playerColor = new Uint8Array(state.playerColor);

    this.recolorTerritory(owner, color, playerId, colorIndex);
    playerColor[playerId] = colorIndex;

    this.expandTerritory(owner, color, state.cols, state.rows, playerId, colorIndex);

    const score = this.calculateScore(owner);

    return {
      ...state,
      owner,
      color,
      playerColor,
      score,
      currentPlayer: playerId === 1 ? 2 : 1
    };
  }

  private fillRandomColors(colors: Uint8Array, paletteSize: number): void {
    for (let index = 0; index < colors.length; index += 1) {
      colors[index] = Math.floor(Math.random() * paletteSize);
    }
  }

  private validateInitialState(config: GameConfig): boolean {
    const tlIndex = 0;
    const brIndex = config.cols * config.rows - 1;

    if (config.colors[tlIndex] === config.colors[brIndex]) {
      return false;
    }

    const visited1 = new Set<number>();
    const visited2 = new Set<number>();

    this.collectFlood(config.colors, config.cols, config.rows, tlIndex, visited1);
    this.collectFlood(config.colors, config.cols, config.rows, brIndex, visited2);

    for (const cell of visited1) {
      if (visited2.has(cell)) {
        return false;
      }
    }

    return true;
  }

  private floodFill(
    colors: Uint8Array,
    owner: Uint8Array,
    cols: number,
    rows: number,
    startIndex: number,
    playerId: PlayerId
  ): void {
    const targetColor = colors[startIndex];
    const queue: number[] = [startIndex];
    const visited = new Set<number>();

    while (queue.length) {
      const current = queue.shift() as number;
      if (visited.has(current)) {
        continue;
      }

      visited.add(current);
      owner[current] = playerId;

      const neighbors = this.getNeighbors(current, cols, rows);
      neighbors.forEach((neighbor) => {
        if (!visited.has(neighbor) && colors[neighbor] === targetColor) {
          queue.push(neighbor);
        }
      });
    }
  }

  private collectFlood(
    colors: Uint8Array,
    cols: number,
    rows: number,
    startIndex: number,
    result: Set<number>
  ): void {
    const targetColor = colors[startIndex];
    const queue: number[] = [startIndex];

    while (queue.length) {
      const current = queue.shift() as number;
      if (result.has(current)) {
        continue;
      }

      result.add(current);

      const neighbors = this.getNeighbors(current, cols, rows);
      neighbors.forEach((neighbor) => {
        if (!result.has(neighbor) && colors[neighbor] === targetColor) {
          queue.push(neighbor);
        }
      });
    }
  }

  private recolorTerritory(owner: Uint8Array, color: Uint8Array, playerId: PlayerId, colorIndex: number): void {
    for (let index = 0; index < owner.length; index += 1) {
      if (owner[index] === playerId) {
        color[index] = colorIndex;
      }
    }
  }

  private expandTerritory(
    owner: Uint8Array,
    color: Uint8Array,
    cols: number,
    rows: number,
    playerId: PlayerId,
    colorIndex: number
  ): void {
    const queue: number[] = [];

    for (let index = 0; index < owner.length; index += 1) {
      if (owner[index] === playerId) {
        queue.push(index);
      }
    }

    const visited = new Set<number>(queue);

    while (queue.length) {
      const current = queue.shift() as number;
      const neighbors = this.getNeighbors(current, cols, rows);

      neighbors.forEach((neighbor) => {
        if (visited.has(neighbor)) {
          return;
        }

        if (owner[neighbor] !== playerId && color[neighbor] === colorIndex) {
          owner[neighbor] = playerId;
          color[neighbor] = colorIndex;
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
  }

  private calculateScore(owner: Uint8Array): Uint16Array {
    const score = new Uint16Array(3);

    for (let index = 0; index < owner.length; index += 1) {
      const cellOwner = owner[index];
      if (cellOwner === 1 || cellOwner === 2) {
        score[cellOwner] += 1;
      }
    }

    return score;
  }

  private getNeighbors(index: number, cols: number, rows: number): number[] {
    const neighbors: number[] = [];
    const row = Math.floor(index / cols);
    const col = index % cols;

    if (col > 0) neighbors.push(index - 1);
    if (col < cols - 1) neighbors.push(index + 1);
    if (row > 0) neighbors.push(index - cols);
    if (row < rows - 1) neighbors.push(index + cols);

    return neighbors;
  }
}
