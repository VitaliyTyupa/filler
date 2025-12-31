import { GameResult, GameSettings, GameState, PlayerId } from './types.js';

const MAX_INITIAL_ATTEMPTS = 50;

export function generateInitialState(params: GameSettings): GameState {
  const config = {
    cols: params.cols,
    rows: params.rows,
    paletteSize: params.paletteSize,
    colors: new Uint8Array(params.cols * params.rows)
  };

  let attempts = 0;
  let isValid = false;

  while (attempts < MAX_INITIAL_ATTEMPTS && !isValid) {
    fillRandomColors(config.colors, config.paletteSize);
    attempts += 1;
    isValid = validateInitialState(config);
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

  floodFill(color, owner, config.cols, config.rows, tlIndex, 1);
  floodFill(color, owner, config.cols, config.rows, brIndex, 2);

  const score = calculateScore(owner);

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

export function getValidMoves(state: GameState, playerId: PlayerId): boolean[] {
  const moves = new Array<boolean>(state.paletteSize).fill(true);

  const enemyId: PlayerId = playerId === 1 ? 2 : 1;
  const playerCurrentColor = state.playerColor[playerId];
  const enemyCurrentColor = state.playerColor[enemyId];

  if (playerCurrentColor !== undefined) {
    moves[playerCurrentColor] = false;
  }

  if (hasContact(state) && enemyCurrentColor !== undefined) {
    moves[enemyCurrentColor] = false;
  }

  return moves;
}

export function applyMove(state: GameState, playerId: PlayerId, colorIndex: number): GameState {
  if (playerId !== state.currentPlayer) {
    return state;
  }

  const validMoves = getValidMoves(state, playerId);
  if (!validMoves[colorIndex]) {
    return state;
  }

  const owner = new Uint8Array(state.owner);
  const color = new Uint8Array(state.color);
  const playerColor = new Uint8Array(state.playerColor);

  recolorTerritory(owner, color, playerId, colorIndex);
  playerColor[playerId] = colorIndex;

  expandTerritory(owner, color, state.cols, state.rows, playerId, colorIndex);

  const score = calculateScore(owner);

  return {
    ...state,
    owner,
    color,
    playerColor,
    score,
    currentPlayer: playerId === 1 ? 2 : 1
  };
}

export function isGameOver(state: GameState): boolean {
  const totalCells = state.cols * state.rows;
  const occupiedCells = state.score[1] + state.score[2];
  return occupiedCells === totalCells;
}

export function getWinner(state: GameState): GameResult {
  const score1 = state.score[1];
  const score2 = state.score[2];

  if (score1 > score2) {
    return { winner: 1, score1, score2 };
  }

  if (score2 > score1) {
    return { winner: 2, score1, score2 };
  }

  return { winner: 0, score1, score2 };
}

export function pickCpuMove(state: GameState, cpuPlayerId: PlayerId): number {
  const validMoves = getValidMoves(state, cpuPlayerId);
  const adjacentColors = new Set<number>();

  for (let index = 0; index < state.owner.length; index += 1) {
    if (state.owner[index] !== cpuPlayerId) {
      continue;
    }

    const neighbors = getNeighbors(index, state.cols, state.rows);

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

function fillRandomColors(colors: Uint8Array, paletteSize: number): void {
  for (let index = 0; index < colors.length; index += 1) {
    colors[index] = Math.floor(Math.random() * paletteSize);
  }
}

function validateInitialState(config: GameSettings & { colors: Uint8Array }): boolean {
  const tlIndex = 0;
  const brIndex = config.cols * config.rows - 1;

  if (config.colors[tlIndex] === config.colors[brIndex]) {
    return false;
  }

  const visited1 = new Set<number>();
  const visited2 = new Set<number>();

  collectFlood(config.colors, config.cols, config.rows, tlIndex, visited1);
  collectFlood(config.colors, config.cols, config.rows, brIndex, visited2);

  for (const cell of visited1) {
    if (visited2.has(cell)) {
      return false;
    }
  }

  return true;
}

function floodFill(
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

    const neighbors = getNeighbors(current, cols, rows);
    neighbors.forEach((neighbor) => {
      if (!visited.has(neighbor) && colors[neighbor] === targetColor) {
        queue.push(neighbor);
      }
    });
  }
}

function collectFlood(
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

    const neighbors = getNeighbors(current, cols, rows);
    neighbors.forEach((neighbor) => {
      if (!result.has(neighbor) && colors[neighbor] === targetColor) {
        queue.push(neighbor);
      }
    });
  }
}

function recolorTerritory(owner: Uint8Array, color: Uint8Array, playerId: PlayerId, colorIndex: number): void {
  for (let index = 0; index < owner.length; index += 1) {
    if (owner[index] === playerId) {
      color[index] = colorIndex;
    }
  }
}

function expandTerritory(
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
    const neighbors = getNeighbors(current, cols, rows);

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

function calculateScore(owner: Uint8Array): Uint16Array {
  const score = new Uint16Array(3);

  for (let index = 0; index < owner.length; index += 1) {
    const cellOwner = owner[index];
    if (cellOwner === 1 || cellOwner === 2) {
      score[cellOwner] += 1;
    }
  }

  return score;
}

function getNeighbors(index: number, cols: number, rows: number): number[] {
  const neighbors: number[] = [];
  const row = Math.floor(index / cols);
  const col = index % cols;

  if (col > 0) neighbors.push(index - 1);
  if (col < cols - 1) neighbors.push(index + 1);
  if (row > 0) neighbors.push(index - cols);
  if (row < rows - 1) neighbors.push(index + cols);

  return neighbors;
}

function hasContact(state: GameState): boolean {
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

export type { GameResult, GameSettings, GameState, PlayerId };
