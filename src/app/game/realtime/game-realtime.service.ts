import { Injectable } from '@angular/core';
import {
  applyDiff,
  applyMove,
  createInitialState,
  GameDiff,
  GameState,
  GameWinner,
  getWinner,
  isGameOver,
  MoveInput,
  pickCpuMove
} from '@game-core';
import { OpenGameListItem } from '@shared';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionUiStore } from '../session-ui.store';
import { CpuTauntBusService } from '../taunts/cpu-taunt-bus.service';
import { CpuTauntEvent } from '../taunts/cpu-taunt.types';
import { WsGameClient } from './ws-game-client';

export interface RealtimeCreateGameInput {
  cols: number;
  rows: number;
  paletteSize: number;
  seed: number;
  playerName?: string;
  mode?: 'cpu' | 'local' | 'online';
  cpuPlayerId?: 1 | 2;
  cpuDifficulty?: 'standard' | 'master' | 'champion' | 'ultra';
}

export interface RealtimeCreateGameResult {
  sessionId: string;
  state: GameState;
  hostName: string;
  guestName?: string;
}

export interface RealtimeMoveResult {
  state: GameState;
  diffs: GameDiff[];
  gameOver: boolean;
  winner?: GameWinner;
}

export interface RealtimeLobbyState {
  sessionId: string;
  hostConnected: boolean;
  guestConnected: boolean;
  canStart: boolean;
  started: boolean;
  published: boolean;
  openGameStatus?: OpenGameListItem['status'];
  hostName: string;
  guestName?: string;
}

export interface RealtimeRemoteMoveEvent {
  sessionId: string;
  state: GameState;
  diffs: GameDiff[];
  gameOver: boolean;
  winner?: GameWinner;
}

export interface RealtimeRematchStartedEvent {
  sessionId: string;
  state: GameState;
  hostName: string;
  guestName?: string;
}

@Injectable({ providedIn: 'root' })
export class GameRealtimeService {
  private static readonly TAUNT_MILESTONES: Array<10 | 30 | 50 | 70 | 90> = [10, 30, 50, 70, 90];
  private static readonly TAUNT_TONE_IDS: Record<CpuTauntEvent['tone'], number> = {
    winning: 1,
    losing: 2,
    neutral: 3,
    endWinning: 4,
    endLosing: 5
  };

  private readonly sessions = new Map<string, GameState>();
  private readonly sessionTransport = new Map<string, 'local' | 'ws'>();
  private readonly lobbyStateSubject = new Subject<RealtimeLobbyState>();
  readonly lobbyState$ = this.lobbyStateSubject.asObservable();
  private readonly openGamesSubject = new BehaviorSubject<OpenGameListItem[]>([]);
  readonly openGames$ = this.openGamesSubject.asObservable();
  private readonly gameStartedSubject = new Subject<{ sessionId: string; turn: number; hostName: string; guestName?: string }>();
  readonly gameStarted$ = this.gameStartedSubject.asObservable();
  private readonly rematchStartedSubject = new Subject<RealtimeRematchStartedEvent>();
  readonly rematchStarted$ = this.rematchStartedSubject.asObservable();
  private readonly remoteMoveSubject = new Subject<RealtimeRemoteMoveEvent>();
  readonly remoteMove$ = this.remoteMoveSubject.asObservable();
  private readonly tauntMeta = new Map<string, { gameSeed: number; moveNumber: number; milestonesFired: number; endTauntFired: boolean }>();
  private wsClient?: WsGameClient;
  private readonly wsUrl = (globalThis as { __FILLER_WS_URL__?: string }).__FILLER_WS_URL__;

  constructor(
    private readonly tauntBus: CpuTauntBusService,
    private readonly sessionUiStore: SessionUiStore
  ) {}

  async createGame(input: RealtimeCreateGameInput): Promise<RealtimeCreateGameResult> {
    if (input.mode === 'online') {
      this.requireWsUrl();
      const ws = await this.getWsClient();
      const created = await ws.createGame(input);
      this.trackSession(created.sessionId, created.state, 'ws', input.seed >>> 0);
      return created;
    }

    const state = createInitialState(input);
    const sessionId = this.createSessionId();
    this.trackSession(sessionId, state, 'local', input.seed >>> 0);
    return {
      sessionId,
      state,
      hostName: input.playerName?.trim() || $localize`:@@playerFallbackName:Гравець ${1}:playerId:`
    };
  }

  async publishOpenGame(input: RealtimeCreateGameInput): Promise<RealtimeCreateGameResult> {
    this.requireWsUrl();
    const ws = await this.getWsClient();
    const created = await ws.publishOpenGame({
      cols: input.cols,
      rows: input.rows,
      paletteSize: input.paletteSize,
      seed: input.seed,
      playerName: input.playerName
    });
    this.trackSession(created.sessionId, created.state, 'ws', input.seed >>> 0);
    return created;
  }

  async joinGame(sessionId: string, playerName?: string): Promise<RealtimeCreateGameResult | null> {
    this.requireWsUrl();
    const ws = await this.getWsClient();
    const joined = await ws.joinGame(sessionId, playerName);
    this.trackSession(joined.sessionId, joined.state, 'ws', Date.now() >>> 0);
    return joined;
  }

  async requestOpenGameJoin(sessionId: string, playerName?: string): Promise<RealtimeCreateGameResult | null> {
    this.requireWsUrl();
    const ws = await this.getWsClient();
    const joined = await ws.requestOpenGameJoin(sessionId, playerName);
    this.trackSession(joined.sessionId, joined.state, 'ws', Date.now() >>> 0);
    return joined;
  }

  cancelOpenGameJoin(sessionId: string): void {
    if (!this.wsClient) {
      return;
    }
    this.wsClient.cancelOpenGameJoin(sessionId);
  }

  confirmOpenGameJoin(sessionId: string): void {
    if (!this.wsClient) {
      return;
    }
    this.wsClient.confirmOpenGameJoin(sessionId);
  }

  rejectOpenGameJoin(sessionId: string): void {
    if (!this.wsClient) {
      return;
    }
    this.wsClient.rejectOpenGameJoin(sessionId);
  }

  async submitMove(sessionId: string, move: MoveInput): Promise<RealtimeMoveResult | null> {
    const current = this.sessions.get(sessionId);
    if (!current) {
      return null;
    }

    const transport = this.sessionTransport.get(sessionId) ?? 'local';
    if (transport === 'ws') {
      const ws = await this.getWsClient();
      const wsResult = await ws.move(sessionId, move);
      let nextState = current;
      for (const diff of wsResult.diffs) {
        const prevState = nextState;
        nextState = applyDiff(nextState, diff);
        this.handleCpuTaunts(sessionId, prevState, nextState);
      }
      this.sessions.set(sessionId, nextState);
      return {
        state: nextState,
        diffs: wsResult.diffs,
        gameOver: wsResult.gameOver,
        winner: wsResult.winner
      };
    }

    const diffs: GameDiff[] = [];
    let nextState = current;
    const playerResult = applyMove(nextState, move);
    if (!playerResult.diff) {
      return {
        state: nextState,
        diffs,
        gameOver: isGameOver(nextState),
        winner: isGameOver(nextState) ? getWinner(nextState) : undefined
      };
    }

    nextState = playerResult.state;
    this.handleCpuTaunts(sessionId, current, nextState);
    diffs.push(playerResult.diff);
    this.sessions.set(sessionId, nextState);

    if (isGameOver(nextState)) {
      return {
        state: nextState,
        diffs,
        gameOver: true,
        winner: getWinner(nextState)
      };
    }

    if (nextState.cpuPlayerId && nextState.currentPlayer === nextState.cpuPlayerId) {
      const cpuColor = pickCpuMove(nextState);
      const cpuResult = applyMove(nextState, {
        playerId: nextState.cpuPlayerId,
        colorIndex: cpuColor,
        expectedTurn: nextState.turn
      });

      if (cpuResult.diff) {
        const prevState = nextState;
        nextState = cpuResult.state;
        this.handleCpuTaunts(sessionId, prevState, nextState);
        diffs.push(cpuResult.diff);
        this.sessions.set(sessionId, nextState);
      }
    }

    return {
      state: nextState,
      diffs,
      gameOver: isGameOver(nextState),
      winner: isGameOver(nextState) ? getWinner(nextState) : undefined
    };
  }

  getState(sessionId: string): GameState | undefined {
    return this.sessions.get(sessionId);
  }

  startGame(sessionId: string): void {
    if (!this.wsClient) {
      return;
    }
    this.wsClient.startGame(sessionId);
  }

  requestRematch(sessionId: string): void {
    if (!this.wsClient) {
      return;
    }
    this.wsClient.requestRematch(sessionId);
  }

  async ensureLobbyConnection(): Promise<void> {
    this.requireWsUrl();
    await this.getWsClient();
  }

  disconnectOnlineSessions(): void {
    this.wsClient?.close();
    this.wsClient = undefined;
    this.openGamesSubject.next([]);

    for (const [sessionId, transport] of Array.from(this.sessionTransport.entries())) {
      if (transport !== 'ws') {
        continue;
      }

      this.sessionTransport.delete(sessionId);
      this.sessions.delete(sessionId);
      this.tauntMeta.delete(sessionId);
    }

    this.sessionUiStore.reset();
  }

  private createSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `session_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  }

  private requireWsUrl(): string {
    const wsUrl = this.wsUrl?.trim();
    if (!wsUrl) {
      throw new Error('WS URL is not configured');
    }
    return wsUrl;
  }

  private async getWsClient(): Promise<WsGameClient> {
    const wsUrl = this.requireWsUrl();
    if (this.wsClient && !this.wsClient.isOpen()) {
      this.wsClient = undefined;
    }

    if (!this.wsClient) {
      this.wsClient = new WsGameClient(wsUrl);
      this.wsClient.onClosed(() => {
        this.wsClient = undefined;
        for (const [sessionId, transport] of this.sessionTransport.entries()) {
          if (transport === 'ws') {
            this.sessionUiStore.markInterrupted(sessionId);
          }
        }
      });
      this.wsClient.onOpenGamesSnapshot((payload) => {
        this.openGamesSubject.next(payload.games);
      });
      this.wsClient.onLobbyState((payload) => {
        this.lobbyStateSubject.next(payload);
      });
      this.wsClient.onGameStarted((payload) => {
        this.gameStartedSubject.next(payload);
      });
      this.wsClient.onRematchStarted((payload) => {
        this.sessions.set(payload.sessionId, payload.state);
        this.tauntMeta.set(payload.sessionId, {
          gameSeed: Date.now() >>> 0,
          moveNumber: 0,
          milestonesFired: 0,
          endTauntFired: false
        });
        this.sessionUiStore.syncGameState({
          sessionId: payload.sessionId,
          state: payload.state,
          status: 'playing',
          playerNames: {
            1: payload.hostName,
            2: payload.guestName ?? $localize`:@@playerFallbackName:Гравець ${2}:playerId:`
          }
        });
        this.rematchStartedSubject.next(payload);
      });
      this.wsClient.onStateDiff((payload) => {
        const current = this.sessions.get(payload.sessionId);
        if (!current) {
          return;
        }
        const nextState = applyDiff(current, payload.diff);
        this.handleCpuTaunts(payload.sessionId, current, nextState);
        this.sessions.set(payload.sessionId, nextState);
        this.sessionUiStore.syncGameState({
          sessionId: payload.sessionId,
          state: nextState,
          status: 'playing'
        });
        this.remoteMoveSubject.next({
          sessionId: payload.sessionId,
          state: nextState,
          diffs: [payload.diff],
          gameOver: isGameOver(nextState),
          winner: isGameOver(nextState) ? getWinner(nextState) : undefined
        });
      });
      this.wsClient.onGameOver((payload) => {
        const current = this.sessions.get(payload.sessionId);
        if (!current) {
          return;
        }
        this.sessionUiStore.syncGameState({
          sessionId: payload.sessionId,
          state: current,
          status: 'finished'
        });
        this.remoteMoveSubject.next({
          sessionId: payload.sessionId,
          state: current,
          diffs: [],
          gameOver: true,
          winner: payload.winner
        });
      });
      await this.wsClient.waitReady();
    }

    return this.wsClient;
  }

  private trackSession(sessionId: string, state: GameState, transport: 'local' | 'ws', gameSeed: number): void {
    this.sessions.set(sessionId, state);
    this.sessionTransport.set(sessionId, transport);
    this.tauntMeta.set(sessionId, {
      gameSeed,
      moveNumber: state.turn,
      milestonesFired: 0,
      endTauntFired: false
    });
  }

  private handleCpuTaunts(sessionId: string, previous: GameState, current: GameState): void {
    if (!current.cpuPlayerId) {
      return;
    }

    const meta = this.tauntMeta.get(sessionId);
    if (!meta || previous.turn === current.turn) {
      return;
    }

    meta.moveNumber += 1;
    const totalCells = current.cols * current.rows;
    const ownedCells = current.score[1] + current.score[2];
    const progressPct = (ownedCells / totalCells) * 100;

    for (const milestone of GameRealtimeService.TAUNT_MILESTONES) {
      const bit = this.getMilestoneBit(milestone);
      if (progressPct >= milestone && (meta.milestonesFired & bit) === 0) {
        meta.milestonesFired |= bit;
        const tone = this.getProgressTone(current, totalCells);
        this.emitTaunt(meta, tone, milestone);
      }
    }

    if (!meta.endTauntFired && isGameOver(current)) {
      meta.endTauntFired = true;
      this.emitTaunt(meta, this.getEndTone(current));
    }
  }

  private emitTaunt(
    meta: { gameSeed: number; moveNumber: number; milestonesFired: number; endTauntFired: boolean },
    tone: CpuTauntEvent['tone'],
    milestone?: CpuTauntEvent['milestone']
  ): void {
    const toneId = GameRealtimeService.TAUNT_TONE_IDS[tone];
    const seed = (meta.gameSeed ^ meta.moveNumber ^ (milestone ?? 0) ^ toneId) >>> 0;
    this.tauntBus.emit({ tone, milestone, seed });
  }

  private getProgressTone(state: GameState, totalCells: number): CpuTauntEvent['tone'] {
    const cpuId = state.cpuPlayerId ?? 2;
    const humanId: 1 | 2 = cpuId === 1 ? 2 : 1;
    const diff = state.score[cpuId] - state.score[humanId];
    const margin = Math.max(3, Math.round(totalCells * 0.02));
    if (diff > margin) {
      return 'winning';
    }
    if (diff < -margin) {
      return 'losing';
    }
    return 'neutral';
  }

  private getEndTone(state: GameState): CpuTauntEvent['tone'] {
    const cpuId = state.cpuPlayerId ?? 2;
    const humanId: 1 | 2 = cpuId === 1 ? 2 : 1;
    return state.score[cpuId] > state.score[humanId] ? 'endWinning' : 'endLosing';
  }

  private getMilestoneBit(milestone: CpuTauntEvent['milestone']): number {
    switch (milestone) {
      case 10:
        return 1 << 0;
      case 30:
        return 1 << 1;
      case 50:
        return 1 << 2;
      case 70:
        return 1 << 3;
      case 90:
      default:
        return 1 << 4;
    }
  }
}
