import {
  ApplyMoveResult,
  CreateGameParams,
  GameDiff,
  GameState,
  GameWinner,
  MoveInput,
  PlayerId
} from './types';

type Rng = () => number;

export function createInitialState(params: CreateGameParams): GameState {
  const size = params.cols * params.rows;
  const colors = new Uint8Array(size);
  const owner = new Uint8Array(size);
  const effect = new Uint8Array(size);
  const rng = createRng(params.seed);

  let valid = false;
  for (let attempt = 0; attempt < 50 && !valid; attempt += 1) {
    for (let i = 0; i < colors.length; i += 1) {
      colors[i] = Math.floor(rng() * params.paletteSize);
    }
    valid = validateInitialBoard(colors, params.cols, params.rows);
  }

  floodFillOwner(colors, owner, params.cols, params.rows, 0, 1);
  floodFillOwner(colors, owner, params.cols, params.rows, size - 1, 2);

  const playerColor = new Uint8Array(3);
  playerColor[1] = colors[0];
  playerColor[2] = colors[size - 1];

  return {
    cols: params.cols,
    rows: params.rows,
    paletteSize: params.paletteSize,
    owner,
    color: colors,
    effect,
    playerColor,
    score: calculateScore(owner),
    currentPlayer: 1,
    turn: 0,
    cpuPlayerId: params.cpuPlayerId,
    cpuDifficulty: params.cpuDifficulty ?? 'standard'
  };
}

export function getValidMoves(state: GameState, playerId: PlayerId): boolean[] {
  const moves = new Array<boolean>(state.paletteSize).fill(true);
  const enemyId: PlayerId = playerId === 1 ? 2 : 1;
  const ownColor = state.playerColor[playerId];
  const enemyColor = state.playerColor[enemyId];
  moves[ownColor] = false;

  if (hasContact(state) && enemyColor !== undefined) {
    moves[enemyColor] = false;
  }

  return moves;
}

export function applyMove(state: GameState, move: MoveInput): ApplyMoveResult {
  if (move.expectedTurn !== undefined && move.expectedTurn !== state.turn) {
    return { state, diff: null };
  }

  if (move.playerId !== state.currentPlayer) {
    return { state, diff: null };
  }

  const validMoves = getValidMoves(state, move.playerId);
  if (!validMoves[move.colorIndex]) {
    return { state, diff: null };
  }

  const owner = new Uint8Array(state.owner);
  const color = new Uint8Array(state.color);
  const effect = new Uint8Array(state.effect);
  const playerColor = new Uint8Array(state.playerColor);

  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i] === move.playerId) {
      color[i] = move.colorIndex;
    }
  }

  playerColor[move.playerId] = move.colorIndex;
  captureTerritory(owner, color, state.cols, state.rows, move.playerId, move.colorIndex);

  const nextState: GameState = {
    ...state,
    owner,
    color,
    effect,
    playerColor,
    score: calculateScore(owner),
    currentPlayer: move.playerId === 1 ? 2 : 1,
    turn: state.turn + 1
  };

  const diff = computeDiff(state, nextState);
  return { state: nextState, diff };
}

export function applyDiff(state: GameState, diff: GameDiff): GameState {
  const owner = new Uint8Array(state.owner);
  const color = new Uint8Array(state.color);
  const playerColor = new Uint8Array(state.playerColor);

  for (let i = 0; i < diff.changedCells.length; i += 1) {
    const idx = diff.changedCells[i];
    owner[idx] = diff.owner[i];
    color[idx] = diff.color[i];
  }

  playerColor[1] = findPlayerColor(owner, color, 1, state.playerColor[1]);
  playerColor[2] = findPlayerColor(owner, color, 2, state.playerColor[2]);

  return {
    ...state,
    owner,
    color,
    playerColor,
    score: calculateScore(owner),
    currentPlayer: diff.nextTurn,
    turn: diff.turn
  };
}

export function computeDiff(prev: GameState, next: GameState): GameDiff {
  const changed: number[] = [];
  for (let i = 0; i < prev.owner.length; i += 1) {
    if (prev.owner[i] !== next.owner[i] || prev.color[i] !== next.color[i]) {
      changed.push(i);
    }
  }

  const changedCells = new Uint32Array(changed.length);
  const owner = new Uint8Array(changed.length);
  const color = new Uint8Array(changed.length);

  for (let i = 0; i < changed.length; i += 1) {
    const idx = changed[i];
    changedCells[i] = idx;
    owner[i] = next.owner[idx];
    color[i] = next.color[idx];
  }

  return {
    changedCells,
    owner,
    color,
    nextTurn: next.currentPlayer,
    turn: next.turn
  };
}

export function isGameOver(state: GameState): boolean {
  return state.score[1] + state.score[2] === state.cols * state.rows;
}

export function getWinner(state: GameState): GameWinner {
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

export function pickCpuMove(state: GameState): number {
  const cpuPlayerId = state.cpuPlayerId ?? state.currentPlayer;
  const validMoves = getValidMoves(state, cpuPlayerId);
  const candidates: number[] = [];

  for (let i = 0; i < validMoves.length; i += 1) {
    if (validMoves[i]) {
      candidates.push(i);
    }
  }

  if (!candidates.length) {
    return state.playerColor[cpuPlayerId];
  }

  let bestColor = candidates[0];
  let bestGain = -1;

  for (const colorIdx of candidates) {
    const gain = evaluateImmediateGain(state, cpuPlayerId, colorIdx);
    if (gain > bestGain || (gain === bestGain && colorIdx < bestColor)) {
      bestGain = gain;
      bestColor = colorIdx;
    }
  }

  return bestColor;
}

function evaluateImmediateGain(state: GameState, playerId: PlayerId, colorIndex: number): number {
  const owner = new Uint8Array(state.owner);
  const color = new Uint8Array(state.color);
  const before = state.score[playerId];
  const move = applyMove(
    {
      ...state,
      owner,
      color,
      currentPlayer: playerId
    },
    { playerId, colorIndex }
  );
  return move.state.score[playerId] - before;
}

function captureTerritory(
  owner: Uint8Array,
  color: Uint8Array,
  cols: number,
  rows: number,
  playerId: PlayerId,
  colorIndex: number
): void {
  const queue = new Int32Array(owner.length);
  const distance = new Int16Array(owner.length);
  distance.fill(-1);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i] === playerId) {
      queue[tail++] = i;
      distance[i] = 0;
    }
  }

  while (head < tail) {
    const index = queue[head++];
    const row = Math.floor(index / cols);
    const col = index - row * cols;

    if (col > 0) {
      maybeCapture(index - 1);
    }
    if (col < cols - 1) {
      maybeCapture(index + 1);
    }
    if (row > 0) {
      maybeCapture(index - cols);
    }
    if (row < rows - 1) {
      maybeCapture(index + cols);
    }
  }

  function maybeCapture(next: number): void {
    if (distance[next] >= 0 || owner[next] === playerId || color[next] !== colorIndex) {
      return;
    }
    owner[next] = playerId;
    color[next] = colorIndex;
    distance[next] = 1;
    queue[tail++] = next;
  }
}

function hasContact(state: GameState): boolean {
  const total = state.cols * state.rows;
  for (let i = 0; i < total; i += 1) {
    if (state.owner[i] !== 1) {
      continue;
    }

    const row = Math.floor(i / state.cols);
    const col = i - row * state.cols;
    if (col > 0 && state.owner[i - 1] === 2) return true;
    if (col < state.cols - 1 && state.owner[i + 1] === 2) return true;
    if (row > 0 && state.owner[i - state.cols] === 2) return true;
    if (row < state.rows - 1 && state.owner[i + state.cols] === 2) return true;
  }

  return false;
}

function validateInitialBoard(colors: Uint8Array, cols: number, rows: number): boolean {
  const last = colors.length - 1;
  if (colors[0] === colors[last]) {
    return false;
  }

  const tl = collectFlood(colors, cols, rows, 0);
  const br = collectFlood(colors, cols, rows, last);

  for (const idx of tl) {
    if (br.has(idx)) {
      return false;
    }
  }

  return true;
}

function floodFillOwner(
  colors: Uint8Array,
  owner: Uint8Array,
  cols: number,
  rows: number,
  startIndex: number,
  playerId: PlayerId
): void {
  const target = colors[startIndex];
  const q: number[] = [startIndex];
  const seen = new Set<number>();

  while (q.length) {
    const current = q.shift() as number;
    if (seen.has(current)) {
      continue;
    }

    seen.add(current);
    owner[current] = playerId;

    for (const neighbor of getNeighbors(current, cols, rows)) {
      if (!seen.has(neighbor) && colors[neighbor] === target) {
        q.push(neighbor);
      }
    }
  }
}

function collectFlood(colors: Uint8Array, cols: number, rows: number, startIndex: number): Set<number> {
  const result = new Set<number>();
  const target = colors[startIndex];
  const q: number[] = [startIndex];

  while (q.length) {
    const current = q.shift() as number;
    if (result.has(current)) {
      continue;
    }
    result.add(current);

    for (const neighbor of getNeighbors(current, cols, rows)) {
      if (!result.has(neighbor) && colors[neighbor] === target) {
        q.push(neighbor);
      }
    }
  }

  return result;
}

function getNeighbors(index: number, cols: number, rows: number): number[] {
  const neighbors: number[] = [];
  const row = Math.floor(index / cols);
  const col = index - row * cols;
  if (col > 0) neighbors.push(index - 1);
  if (col < cols - 1) neighbors.push(index + 1);
  if (row > 0) neighbors.push(index - cols);
  if (row < rows - 1) neighbors.push(index + cols);
  return neighbors;
}

function calculateScore(owner: Uint8Array): Uint16Array {
  const score = new Uint16Array(3);
  for (let i = 0; i < owner.length; i += 1) {
    const value = owner[i];
    if (value === 1 || value === 2) {
      score[value] += 1;
    }
  }
  return score;
}

function createRng(seed: number): Rng {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function findPlayerColor(
  owner: Uint8Array,
  color: Uint8Array,
  playerId: PlayerId,
  fallback: number
): number {
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i] === playerId) {
      return color[i];
    }
  }

  return fallback;
}
