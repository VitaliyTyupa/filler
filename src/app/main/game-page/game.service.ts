import { Injectable } from '@angular/core';
import { CpuDifficulty } from '../../game-session.service';

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

  cpuPlayerId?: PlayerId;
  cpuDifficulty?: CpuDifficulty;
}

@Injectable({ providedIn: 'root' })
export class GameService {
  private currentState?: GameState;
  private simOwner?: Uint8Array;
  private simColor?: Uint8Array;
  private simPlayerColor?: Uint8Array;
  private simScore?: Uint16Array;
  private simCols = 0;
  private simRows = 0;
  private simSize = 0;
  private simPaletteSize = 0;

  private queue: Int32Array = new Int32Array(0);
  private captureQueue: Int32Array = new Int32Array(0);
  private visitedStamp: Uint32Array = new Uint32Array(0);
  private captureStamp: Uint32Array = new Uint32Array(0);
  private frontierStamp: Uint32Array = new Uint32Array(0);
  private stampCounter = 1;

  private diffIndices: Uint32Array = new Uint32Array(0);
  private diffPrevOwner: Uint8Array = new Uint8Array(0);
  private diffPrevColor: Uint8Array = new Uint8Array(0);
  private diffCursor = 0;
  private diffStack: Array<{
    start: number;
    count: number;
    playerId: PlayerId;
    prevPlayerColor: number;
    prevScore: number;
  }> = new Array(8).fill(null).map(() => ({
    start: 0,
    count: 0,
    playerId: 1,
    prevPlayerColor: 0,
    prevScore: 0
  }));
  private diffStackDepth = 0;

  private validMovesBuffer: Uint8Array = new Uint8Array(0);
  private adjacentColorFlags: Uint8Array = new Uint8Array(0);
  private candidateColors: number[] = [];
  private candidateGains: number[] = [];
  private beamFirstColors: number[] = [];
  private beamSecondColors: number[] = [];
  private beamScores: number[] = [];
  private activeCpuPlayerId: PlayerId = 2;
  private activeHumanPlayerId: PlayerId = 1;
  getUsers(): Array<{ id: number; name: string }> {
    return [
      { id: 1, name: 'Player 1' },
      { id: 2, name: 'Player 2' }
    ];
  }

  getPalette(): string[] {
    return [...DEFAULT_PALETTE];
  }

  generateInitialState(params: {
    cols: number;
    rows: number;
    paletteSize: number;
    cpuPlayerId?: PlayerId;
    cpuDifficulty?: CpuDifficulty;
  }): GameState {
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

    const state: GameState = {
      cols: config.cols,
      rows: config.rows,
      paletteSize: config.paletteSize,
      owner,
      color,
      playerColor,
      currentPlayer: 1,
      score,
      cpuPlayerId: params.cpuPlayerId,
      cpuDifficulty: params.cpuDifficulty ?? 'standard'
    };

    this.currentState = state;

    return state;
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

  isGameOver(state: GameState): boolean {
    const totalCells = state.cols * state.rows;
    const occupiedCells = state.score[1] + state.score[2];
    return occupiedCells === totalCells;
  }

  getWinner(state: GameState): { winner: 1 | 2 | 0; score1: number; score2: number } {
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

  pickCpuMove(): number {
    const state = this.currentState;
    if (!state) {
      return 0;
    }

    const cpuPlayerId = state.cpuPlayerId ?? state.currentPlayer;
    this.activeCpuPlayerId = cpuPlayerId;
    this.activeHumanPlayerId = cpuPlayerId === 1 ? 2 : 1;

    this.syncSimulationState(state);

    const difficulty = state.cpuDifficulty ?? 'standard';

    if (difficulty === 'master') {
      return this.pickMasterMove();
    }

    if (difficulty === 'champion') {
      return this.pickChampionMove();
    }

    if (difficulty === 'ultra') {
      return this.pickUltraChampionMove();
    }

    return this.pickStandardMove();
  }

  private pickStandardMove(): number {
    const cpuPlayerId = this.activeCpuPlayerId;
    const validMoves = this.getValidMovesForSimulation(cpuPlayerId);
    const candidateColors = this.collectAdjacentColors(cpuPlayerId, validMoves);

    if (!candidateColors.length) {
      for (let colorIndex = 0; colorIndex < this.simPaletteSize; colorIndex += 1) {
        if (validMoves[colorIndex]) {
          candidateColors.push(colorIndex);
        }
      }
    }

    if (!candidateColors.length) {
      return this.simPlayerColor?.[cpuPlayerId] ?? 0;
    }

    const randomIndex = Math.floor(Math.random() * candidateColors.length);
    return candidateColors[randomIndex];
  }

  private pickMasterMove(): number {
    const cpuPlayerId = this.activeCpuPlayerId;
    const validMoves = this.getValidMovesForSimulation(cpuPlayerId);

    let bestColor = this.simPlayerColor?.[cpuPlayerId] ?? 0;
    let bestGain = -1;
    let bestPotential = -1;

    for (let colorIndex = 0; colorIndex < this.simPaletteSize; colorIndex += 1) {
      if (!validMoves[colorIndex]) {
        continue;
      }

      const gain = this.evaluateImmediateGain(colorIndex, cpuPlayerId);

      if (gain < bestGain) {
        continue;
      }

      let potential = bestPotential;
      if (gain > bestGain || gain === bestGain) {
        const diff = this.simulateMove(colorIndex, cpuPlayerId);
        potential = this.estimateExpansionPotential(cpuPlayerId);
        this.revertSimulation(diff);
      }

      if (
        gain > bestGain
        || (gain === bestGain && potential > bestPotential)
        || (gain === bestGain && potential === bestPotential && colorIndex < bestColor)
      ) {
        bestGain = gain;
        bestPotential = potential;
        bestColor = colorIndex;
      }
    }

    return bestColor;
  }

  private pickChampionMove(): number {
    const cpuPlayerId = this.activeCpuPlayerId;
    const maxCandidates = 5;
    const beamWidth = 4;
    const depth = 3;

    const candidateColors = this.candidateColors;
    const candidateGains = this.candidateGains;
    const beamFirst = this.beamFirstColors;
    const beamSecond = this.beamSecondColors;
    const beamScores = this.beamScores;

    let bestColor = this.simPlayerColor?.[cpuPlayerId] ?? 0;
    let bestScore = -Infinity;

    let beamCount = 0;
    beamFirst.length = 0;
    beamSecond.length = 0;
    beamScores.length = 0;
    const depth1Count = this.collectTopColorsByGain(cpuPlayerId, maxCandidates, candidateColors, candidateGains);
    beamCount = 0;

    for (let i = 0; i < depth1Count; i += 1) {
      const color1 = candidateColors[i];
      const diff1 = this.simulateMove(color1, cpuPlayerId);
      const score1 = this.evaluateState(cpuPlayerId);
      beamCount = this.insertBeamEntry(beamFirst, beamSecond, beamScores, beamWidth, beamCount, color1, -1, score1);
      this.revertSimulation(diff1);
    }

    for (let currentDepth = 2; currentDepth <= depth; currentDepth += 1) {
      const nextBeamFirst: number[] = [];
      const nextBeamSecond: number[] = [];
      const nextBeamScores: number[] = [];

      let nextBeamCount = 0;

      for (let i = 0; i < beamCount; i += 1) {
        const color1 = beamFirst[i];
        const color2 = beamSecond[i];

        const diff1 = this.simulateMove(color1, cpuPlayerId);
        let diff2: ReturnType<GameService['simulateMove']> | null = null;
        if (color2 !== -1) {
          diff2 = this.simulateMove(color2, cpuPlayerId);
        }

        const candidates = this.collectTopColorsByGain(cpuPlayerId, maxCandidates, candidateColors, candidateGains);
        for (let j = 0; j < candidates; j += 1) {
          const nextColor = candidateColors[j];
          const diff = this.simulateMove(nextColor, cpuPlayerId);
          const score = this.evaluateState(cpuPlayerId);

          const rootColor = color1;
          const secondaryColor = currentDepth === 2 ? nextColor : color2;

          nextBeamCount = this.insertBeamEntry(
            nextBeamFirst,
            nextBeamSecond,
            nextBeamScores,
            beamWidth,
            nextBeamCount,
            rootColor,
            secondaryColor,
            score
          );

          if (currentDepth === depth && score > bestScore) {
            bestScore = score;
            bestColor = rootColor;
          }

          this.revertSimulation(diff);
        }

        if (diff2) {
          this.revertSimulation(diff2);
        }
        this.revertSimulation(diff1);
      }

      beamCount = nextBeamCount;
      beamFirst.length = beamCount;
      beamSecond.length = beamCount;
      beamScores.length = beamCount;

      for (let i = 0; i < beamCount; i += 1) {
        beamFirst[i] = nextBeamFirst[i];
        beamSecond[i] = nextBeamSecond[i];
        beamScores[i] = nextBeamScores[i];
      }
    }

    return bestColor;
  }

  private pickUltraChampionMove(): number {
    const cpuPlayerId = this.activeCpuPlayerId;
    const humanPlayerId = this.activeHumanPlayerId;
    const maxCandidates = 5;
    const depth = 4;

    const candidateColors = this.candidateColors;
    const candidateGains = this.candidateGains;

    let bestColor = this.simPlayerColor?.[cpuPlayerId] ?? 0;
    let bestScore = -Infinity;

    const candidateCount = this.collectTopColorsByGain(cpuPlayerId, maxCandidates, candidateColors, candidateGains);
    for (let i = 0; i < candidateCount; i += 1) {
      const color = candidateColors[i];
      const diff = this.simulateMove(color, cpuPlayerId);
      const score = this.minimax(depth - 1, humanPlayerId, cpuPlayerId, humanPlayerId, -Infinity, Infinity, maxCandidates);
      this.revertSimulation(diff);

      if (score > bestScore || (score === bestScore && color < bestColor)) {
        bestScore = score;
        bestColor = color;
      }
    }

    return bestColor;
  }

  private minimax(
    depth: number,
    currentPlayer: PlayerId,
    cpuPlayerId: PlayerId,
    humanPlayerId: PlayerId,
    alpha: number,
    beta: number,
    maxCandidates: number
  ): number {
    if (depth <= 0 || this.isSimulationGameOver()) {
      const cpuScore = this.evaluateState(cpuPlayerId);
      const humanScore = this.evaluateState(humanPlayerId);
      return cpuScore - humanScore;
    }

    const candidateColors = this.candidateColors;
    const candidateGains = this.candidateGains;
    const candidateCount = this.collectTopColorsByGain(currentPlayer, maxCandidates, candidateColors, candidateGains);

    if (!candidateCount) {
      const cpuScore = this.evaluateState(cpuPlayerId);
      const humanScore = this.evaluateState(humanPlayerId);
      return cpuScore - humanScore;
    }

    const isMaximizing = currentPlayer === cpuPlayerId;
    let best = isMaximizing ? -Infinity : Infinity;
    for (let i = 0; i < candidateCount; i += 1) {
      const color = candidateColors[i];
      const diff = this.simulateMove(color, currentPlayer);
      const score = this.minimax(
        depth - 1,
        currentPlayer === 1 ? 2 : 1,
        cpuPlayerId,
        humanPlayerId,
        alpha,
        beta,
        maxCandidates
      );
      this.revertSimulation(diff);

      if (isMaximizing) {
        if (score > best) {
          best = score;
        }
        if (score > alpha) {
          alpha = score;
        }
        if (alpha >= beta) {
          break;
        }
      } else {
        if (score < best) {
          best = score;
        }
        if (score < beta) {
          beta = score;
        }
        if (beta <= alpha) {
          break;
        }
      }
    }

    return best;
  }

  private syncSimulationState(state: GameState): void {
    const totalCells = state.cols * state.rows;

    if (this.simSize !== totalCells) {
      this.simOwner = new Uint8Array(totalCells);
      this.simColor = new Uint8Array(totalCells);
      this.visitedStamp = new Uint32Array(totalCells);
      this.captureStamp = new Uint32Array(totalCells);
      this.frontierStamp = new Uint32Array(totalCells);
      this.queue = new Int32Array(totalCells);
      this.captureQueue = new Int32Array(totalCells);
      this.diffIndices = new Uint32Array(totalCells);
      this.diffPrevOwner = new Uint8Array(totalCells);
      this.diffPrevColor = new Uint8Array(totalCells);
      this.simSize = totalCells;
    }

    if (!this.simPlayerColor || this.simPlayerColor.length !== state.playerColor.length) {
      this.simPlayerColor = new Uint8Array(state.playerColor.length);
    }

    if (!this.simScore || this.simScore.length !== state.score.length) {
      this.simScore = new Uint16Array(state.score.length);
    }

    if (this.validMovesBuffer.length !== state.paletteSize) {
      this.validMovesBuffer = new Uint8Array(state.paletteSize);
      this.adjacentColorFlags = new Uint8Array(state.paletteSize);
    }

    this.simCols = state.cols;
    this.simRows = state.rows;
    this.simPaletteSize = state.paletteSize;

    this.simOwner?.set(state.owner);
    this.simColor?.set(state.color);
    this.simPlayerColor?.set(state.playerColor);
    this.simScore?.set(state.score);

    this.diffCursor = 0;
    this.diffStackDepth = 0;
  }

  private getValidMovesForSimulation(playerId: PlayerId): Uint8Array {
    const validMoves = this.validMovesBuffer;
    validMoves.fill(1);

    const playerColor = this.simPlayerColor?.[playerId];
    if (playerColor !== undefined) {
      validMoves[playerColor] = 0;
    }

    const enemyId = playerId === 1 ? 2 : 1;
    if (this.hasContactSim(playerId)) {
      const enemyColor = this.simPlayerColor?.[enemyId];
      if (enemyColor !== undefined) {
        validMoves[enemyColor] = 0;
      }
    }

    return validMoves;
  }

  private collectAdjacentColors(playerId: PlayerId, validMoves: Uint8Array): number[] {
    const adjacentFlags = this.adjacentColorFlags;
    adjacentFlags.fill(0);

    const owner = this.simOwner as Uint8Array;
    const colors = this.simColor as Uint8Array;
    const totalCells = this.simSize;
    const cols = this.simCols;

    const queue = this.queue;
    let head = 0;
    let tail = 0;

    const stamp = this.nextStamp();
    const startIndex = this.getStartIndex(playerId, totalCells);
    queue[tail++] = startIndex;

    while (head < tail) {
      const index = queue[head++];
      if (this.visitedStamp[index] === stamp) {
        continue;
      }
      this.visitedStamp[index] = stamp;

      const row = Math.floor(index / cols);
      const col = index - row * cols;

      if (col > 0) {
        const neighbor = index - 1;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== stamp) {
            queue[tail++] = neighbor;
          }
        } else {
          adjacentFlags[colors[neighbor]] = 1;
        }
      }
      if (col < cols - 1) {
        const neighbor = index + 1;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== stamp) {
            queue[tail++] = neighbor;
          }
        } else {
          adjacentFlags[colors[neighbor]] = 1;
        }
      }
      if (row > 0) {
        const neighbor = index - cols;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== stamp) {
            queue[tail++] = neighbor;
          }
        } else {
          adjacentFlags[colors[neighbor]] = 1;
        }
      }
      if (row < this.simRows - 1) {
        const neighbor = index + cols;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== stamp) {
            queue[tail++] = neighbor;
          }
        } else {
          adjacentFlags[colors[neighbor]] = 1;
        }
      }
    }

    const result = this.candidateColors;
    result.length = 0;
    for (let colorIndex = 0; colorIndex < this.simPaletteSize; colorIndex += 1) {
      if (adjacentFlags[colorIndex] && validMoves[colorIndex]) {
        result.push(colorIndex);
      }
    }

    return result;
  }

  private collectTopColorsByGain(
    playerId: PlayerId,
    maxCount: number,
    colorsOut: number[],
    gainsOut: number[]
  ): number {
    const validMoves = this.getValidMovesForSimulation(playerId);
    colorsOut.length = 0;
    gainsOut.length = 0;

    for (let colorIndex = 0; colorIndex < this.simPaletteSize; colorIndex += 1) {
      if (!validMoves[colorIndex]) {
        continue;
      }

      const gain = this.evaluateImmediateGain(colorIndex, playerId);
      let insertAt = colorsOut.length;

      while (insertAt > 0) {
        const prevGain = gainsOut[insertAt - 1];
        const prevColor = colorsOut[insertAt - 1];
        if (gain < prevGain || (gain === prevGain && colorIndex > prevColor)) {
          break;
        }
        insertAt -= 1;
      }

      if (insertAt >= maxCount) {
        continue;
      }

      const currentLength = colorsOut.length;
      if (currentLength < maxCount) {
        colorsOut.length = currentLength + 1;
        gainsOut.length = currentLength + 1;
      }

      for (let shift = Math.min(currentLength, maxCount - 1); shift > insertAt; shift -= 1) {
        colorsOut[shift] = colorsOut[shift - 1];
        gainsOut[shift] = gainsOut[shift - 1];
      }
      colorsOut[insertAt] = colorIndex;
      gainsOut[insertAt] = gain;
    }

    return colorsOut.length;
  }

  private insertBeamEntry(
    beamFirst: number[],
    beamSecond: number[],
    beamScores: number[],
    beamWidth: number,
    beamCount: number,
    firstColor: number,
    secondColor: number,
    score: number
  ): number {
    let insertAt = beamCount;
    while (insertAt > 0) {
      const prevScore = beamScores[insertAt - 1];
      if (score <= prevScore) {
        break;
      }
      insertAt -= 1;
    }

    if (insertAt >= beamWidth) {
      return beamCount;
    }

    if (beamCount < beamWidth) {
      beamFirst[beamCount] = firstColor;
      beamSecond[beamCount] = secondColor;
      beamScores[beamCount] = score;
      beamCount += 1;
    }

    for (let shift = Math.min(beamCount - 1, beamWidth - 1); shift > insertAt; shift -= 1) {
      beamFirst[shift] = beamFirst[shift - 1];
      beamSecond[shift] = beamSecond[shift - 1];
      beamScores[shift] = beamScores[shift - 1];
    }

    beamFirst[insertAt] = firstColor;
    beamSecond[insertAt] = secondColor;
    beamScores[insertAt] = score;

    return beamCount;
  }

  private evaluateImmediateGain(colorIndex: number, playerId: PlayerId): number {
    const owner = this.simOwner as Uint8Array;
    const colors = this.simColor as Uint8Array;
    const totalCells = this.simSize;
    const cols = this.simCols;
    const rows = this.simRows;

    const queue = this.queue;
    const captureQueue = this.captureQueue;

    let head = 0;
    let tail = 0;
    let captureHead = 0;
    let captureTail = 0;
    let gain = 0;

    const territoryStamp = this.nextStamp();
    const captureStamp = this.nextStamp();

    const startIndex = this.getStartIndex(playerId, totalCells);
    queue[tail++] = startIndex;

    while (head < tail) {
      const index = queue[head++];
      if (this.visitedStamp[index] === territoryStamp) {
        continue;
      }
      this.visitedStamp[index] = territoryStamp;

      const row = Math.floor(index / cols);
      const col = index - row * cols;

      if (col > 0) {
        const neighbor = index - 1;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && colors[neighbor] === colorIndex && this.captureStamp[neighbor] !== captureStamp) {
          captureQueue[captureTail++] = neighbor;
          this.captureStamp[neighbor] = captureStamp;
        }
      }
      if (col < cols - 1) {
        const neighbor = index + 1;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && colors[neighbor] === colorIndex && this.captureStamp[neighbor] !== captureStamp) {
          captureQueue[captureTail++] = neighbor;
          this.captureStamp[neighbor] = captureStamp;
        }
      }
      if (row > 0) {
        const neighbor = index - cols;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && colors[neighbor] === colorIndex && this.captureStamp[neighbor] !== captureStamp) {
          captureQueue[captureTail++] = neighbor;
          this.captureStamp[neighbor] = captureStamp;
        }
      }
      if (row < rows - 1) {
        const neighbor = index + cols;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && colors[neighbor] === colorIndex && this.captureStamp[neighbor] !== captureStamp) {
          captureQueue[captureTail++] = neighbor;
          this.captureStamp[neighbor] = captureStamp;
        }
      }

      while (captureHead < captureTail) {
        const captureIndex = captureQueue[captureHead++];
        gain += 1;

        const captureRow = Math.floor(captureIndex / cols);
        const captureCol = captureIndex - captureRow * cols;

        if (captureCol > 0) {
          const captureNeighbor = captureIndex - 1;
          if (owner[captureNeighbor] === 0 && colors[captureNeighbor] === colorIndex && this.captureStamp[captureNeighbor] !== captureStamp) {
            this.captureStamp[captureNeighbor] = captureStamp;
            captureQueue[captureTail++] = captureNeighbor;
          }
        }
        if (captureCol < cols - 1) {
          const captureNeighbor = captureIndex + 1;
          if (owner[captureNeighbor] === 0 && colors[captureNeighbor] === colorIndex && this.captureStamp[captureNeighbor] !== captureStamp) {
            this.captureStamp[captureNeighbor] = captureStamp;
            captureQueue[captureTail++] = captureNeighbor;
          }
        }
        if (captureRow > 0) {
          const captureNeighbor = captureIndex - cols;
          if (owner[captureNeighbor] === 0 && colors[captureNeighbor] === colorIndex && this.captureStamp[captureNeighbor] !== captureStamp) {
            this.captureStamp[captureNeighbor] = captureStamp;
            captureQueue[captureTail++] = captureNeighbor;
          }
        }
        if (captureRow < rows - 1) {
          const captureNeighbor = captureIndex + cols;
          if (owner[captureNeighbor] === 0 && colors[captureNeighbor] === colorIndex && this.captureStamp[captureNeighbor] !== captureStamp) {
            this.captureStamp[captureNeighbor] = captureStamp;
            captureQueue[captureTail++] = captureNeighbor;
          }
        }
      }
    }

    return gain;
  }

  private simulateMove(colorIndex: number, playerId: PlayerId) {
    const owner = this.simOwner as Uint8Array;
    const colors = this.simColor as Uint8Array;
    const totalCells = this.simSize;
    const cols = this.simCols;
    const rows = this.simRows;

    const diff = this.diffStack[this.diffStackDepth];
    this.diffStackDepth += 1;
    diff.start = this.diffCursor;
    diff.count = 0;
    diff.playerId = playerId;
    diff.prevPlayerColor = this.simPlayerColor?.[playerId] ?? 0;
    diff.prevScore = this.simScore?.[playerId] ?? 0;

    if (this.simPlayerColor) {
      this.simPlayerColor[playerId] = colorIndex;
    }

    const queue = this.queue;
    const captureQueue = this.captureQueue;
    let head = 0;
    let tail = 0;
    let captureHead = 0;
    let captureTail = 0;

    const territoryStamp = this.nextStamp();
    const captureStamp = this.nextStamp();

    const startIndex = this.getStartIndex(playerId, totalCells);
    queue[tail++] = startIndex;

    while (head < tail) {
      const index = queue[head++];
      if (this.visitedStamp[index] === territoryStamp) {
        continue;
      }
      this.visitedStamp[index] = territoryStamp;

      const row = Math.floor(index / cols);
      const col = index - row * cols;

      if (col > 0) {
        const neighbor = index - 1;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && colors[neighbor] === colorIndex && this.captureStamp[neighbor] !== captureStamp) {
          captureQueue[captureTail++] = neighbor;
          this.captureStamp[neighbor] = captureStamp;
        }
      }
      if (col < cols - 1) {
        const neighbor = index + 1;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && colors[neighbor] === colorIndex && this.captureStamp[neighbor] !== captureStamp) {
          captureQueue[captureTail++] = neighbor;
          this.captureStamp[neighbor] = captureStamp;
        }
      }
      if (row > 0) {
        const neighbor = index - cols;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && colors[neighbor] === colorIndex && this.captureStamp[neighbor] !== captureStamp) {
          captureQueue[captureTail++] = neighbor;
          this.captureStamp[neighbor] = captureStamp;
        }
      }
      if (row < rows - 1) {
        const neighbor = index + cols;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && colors[neighbor] === colorIndex && this.captureStamp[neighbor] !== captureStamp) {
          captureQueue[captureTail++] = neighbor;
          this.captureStamp[neighbor] = captureStamp;
        }
      }

      while (captureHead < captureTail) {
        const captureIndex = captureQueue[captureHead++];

        this.diffIndices[this.diffCursor] = captureIndex;
        this.diffPrevOwner[this.diffCursor] = owner[captureIndex];
        this.diffPrevColor[this.diffCursor] = colors[captureIndex];
        this.diffCursor += 1;
        diff.count += 1;

        owner[captureIndex] = playerId;
        colors[captureIndex] = colorIndex;

        const captureRow = Math.floor(captureIndex / cols);
        const captureCol = captureIndex - captureRow * cols;

        if (captureCol > 0) {
          const captureNeighbor = captureIndex - 1;
          if (owner[captureNeighbor] === 0 && colors[captureNeighbor] === colorIndex && this.captureStamp[captureNeighbor] !== captureStamp) {
            this.captureStamp[captureNeighbor] = captureStamp;
            captureQueue[captureTail++] = captureNeighbor;
          }
        }
        if (captureCol < cols - 1) {
          const captureNeighbor = captureIndex + 1;
          if (owner[captureNeighbor] === 0 && colors[captureNeighbor] === colorIndex && this.captureStamp[captureNeighbor] !== captureStamp) {
            this.captureStamp[captureNeighbor] = captureStamp;
            captureQueue[captureTail++] = captureNeighbor;
          }
        }
        if (captureRow > 0) {
          const captureNeighbor = captureIndex - cols;
          if (owner[captureNeighbor] === 0 && colors[captureNeighbor] === colorIndex && this.captureStamp[captureNeighbor] !== captureStamp) {
            this.captureStamp[captureNeighbor] = captureStamp;
            captureQueue[captureTail++] = captureNeighbor;
          }
        }
        if (captureRow < rows - 1) {
          const captureNeighbor = captureIndex + cols;
          if (owner[captureNeighbor] === 0 && colors[captureNeighbor] === colorIndex && this.captureStamp[captureNeighbor] !== captureStamp) {
            this.captureStamp[captureNeighbor] = captureStamp;
            captureQueue[captureTail++] = captureNeighbor;
          }
        }
      }
    }

    if (this.simScore) {
      this.simScore[playerId] += diff.count;
    }

    return diff;
  }

  private revertSimulation(diff: { start: number; count: number; playerId: PlayerId; prevPlayerColor: number; prevScore: number }): void {
    const owner = this.simOwner as Uint8Array;
    const colors = this.simColor as Uint8Array;

    for (let i = diff.start + diff.count - 1; i >= diff.start; i -= 1) {
      const index = this.diffIndices[i];
      owner[index] = this.diffPrevOwner[i];
      colors[index] = this.diffPrevColor[i];
    }

    if (this.simPlayerColor) {
      this.simPlayerColor[diff.playerId] = diff.prevPlayerColor;
    }
    if (this.simScore) {
      this.simScore[diff.playerId] = diff.prevScore;
    }

    this.diffCursor = diff.start;
    this.diffStackDepth = Math.max(0, this.diffStackDepth - 1);
  }

  private estimateExpansionPotential(playerId: PlayerId): number {
    const owner = this.simOwner as Uint8Array;
    const totalCells = this.simSize;
    const cols = this.simCols;
    const rows = this.simRows;

    const queue = this.queue;
    let head = 0;
    let tail = 0;
    let potential = 0;

    const territoryStamp = this.nextStamp();
    const frontierStamp = this.nextStamp();

    const startIndex = this.getStartIndex(playerId, totalCells);
    queue[tail++] = startIndex;

    while (head < tail) {
      const index = queue[head++];
      if (this.visitedStamp[index] === territoryStamp) {
        continue;
      }
      this.visitedStamp[index] = territoryStamp;

      const row = Math.floor(index / cols);
      const col = index - row * cols;

      if (col > 0) {
        const neighbor = index - 1;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && this.frontierStamp[neighbor] !== frontierStamp) {
          this.frontierStamp[neighbor] = frontierStamp;
          potential += 1;
        }
      }
      if (col < cols - 1) {
        const neighbor = index + 1;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && this.frontierStamp[neighbor] !== frontierStamp) {
          this.frontierStamp[neighbor] = frontierStamp;
          potential += 1;
        }
      }
      if (row > 0) {
        const neighbor = index - cols;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && this.frontierStamp[neighbor] !== frontierStamp) {
          this.frontierStamp[neighbor] = frontierStamp;
          potential += 1;
        }
      }
      if (row < rows - 1) {
        const neighbor = index + cols;
        if (owner[neighbor] === playerId) {
          if (this.visitedStamp[neighbor] !== territoryStamp) {
            queue[tail++] = neighbor;
          }
        } else if (owner[neighbor] === 0 && this.frontierStamp[neighbor] !== frontierStamp) {
          this.frontierStamp[neighbor] = frontierStamp;
          potential += 1;
        }
      }
    }

    return potential;
  }

  private evaluateState(playerId: PlayerId): number {
    const area = this.simScore?.[playerId] ?? 0;
    const expansion = this.estimateExpansionPotential(playerId);
    return area + 0.5 * expansion;
  }

  private hasContactSim(playerId: PlayerId): boolean {
    const owner = this.simOwner as Uint8Array;
    const totalCells = this.simSize;
    const cols = this.simCols;
    const rows = this.simRows;
    const enemyId = playerId === 1 ? 2 : 1;

    const queue = this.queue;
    let head = 0;
    let tail = 0;

    const stamp = this.nextStamp();
    const startIndex = this.getStartIndex(playerId, totalCells);
    queue[tail++] = startIndex;

    while (head < tail) {
      const index = queue[head++];
      if (this.visitedStamp[index] === stamp) {
        continue;
      }
      this.visitedStamp[index] = stamp;

      const row = Math.floor(index / cols);
      const col = index - row * cols;

      if (col > 0) {
        const neighbor = index - 1;
        const cellOwner = owner[neighbor];
        if (cellOwner === enemyId) {
          return true;
        }
        if (cellOwner === playerId && this.visitedStamp[neighbor] !== stamp) {
          queue[tail++] = neighbor;
        }
      }
      if (col < cols - 1) {
        const neighbor = index + 1;
        const cellOwner = owner[neighbor];
        if (cellOwner === enemyId) {
          return true;
        }
        if (cellOwner === playerId && this.visitedStamp[neighbor] !== stamp) {
          queue[tail++] = neighbor;
        }
      }
      if (row > 0) {
        const neighbor = index - cols;
        const cellOwner = owner[neighbor];
        if (cellOwner === enemyId) {
          return true;
        }
        if (cellOwner === playerId && this.visitedStamp[neighbor] !== stamp) {
          queue[tail++] = neighbor;
        }
      }
      if (row < rows - 1) {
        const neighbor = index + cols;
        const cellOwner = owner[neighbor];
        if (cellOwner === enemyId) {
          return true;
        }
        if (cellOwner === playerId && this.visitedStamp[neighbor] !== stamp) {
          queue[tail++] = neighbor;
        }
      }
    }

    return false;
  }

  private isSimulationGameOver(): boolean {
    const totalCells = this.simSize;
    const score = this.simScore;
    if (!score) {
      return false;
    }
    return score[1] + score[2] >= totalCells;
  }

  private getStartIndex(playerId: PlayerId, totalCells: number): number {
    return playerId === 1 ? 0 : totalCells - 1;
  }

  private nextStamp(): number {
    this.stampCounter += 1;
    if (this.stampCounter > 0x7ffffffe) {
      this.visitedStamp.fill(0);
      this.captureStamp.fill(0);
      this.frontierStamp.fill(0);
      this.stampCounter = 1;
    }
    return this.stampCounter;
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

    const nextState: GameState = {
      ...state,
      owner,
      color,
      playerColor,
      score,
      currentPlayer: playerId === 1 ? 2 : 1
    };

    this.currentState = nextState;

    return nextState;
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
