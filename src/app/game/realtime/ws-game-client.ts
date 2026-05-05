import { GameDiff, GameState, GameWinner, MoveInput } from '@game-core';
import { ClientEvent, decodeServerBinaryFrame, ServerEvent } from '@shared';

type PendingCreate = {
  resolve: (value: { sessionId: string; state: GameState; hostName: string; guestName?: string }) => void;
  reject: (reason?: unknown) => void;
};

type PendingJoin = {
  resolve: (value: { sessionId: string; state: GameState; hostName: string; guestName?: string }) => void;
  reject: (reason?: unknown) => void;
};

type PendingMove = {
  sessionId: string;
  diffs: GameDiff[];
  resolve: (value: { diffs: GameDiff[]; gameOver: boolean; winner?: GameWinner }) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class WsGameClient {
  private readonly socket: WebSocket;
  private pendingCreate?: PendingCreate;
  private pendingJoin?: PendingJoin;
  private pendingMove?: PendingMove;
  private lobbyStateListener?: (payload: Extract<ServerEvent, { type: 'lobby_state' }>['payload']) => void;
  private gameStartedListener?: (payload: Extract<ServerEvent, { type: 'game_started' }>['payload']) => void;
  private rematchStartedListener?: (payload: Extract<ServerEvent, { type: 'rematch_started' }>['payload']) => void;
  private stateDiffListener?: (payload: Extract<ServerEvent, { type: 'state_diff' }>['payload']) => void;
  private gameOverListener?: (payload: Extract<ServerEvent, { type: 'game_over' }>['payload']) => void;
  private closedListener?: () => void;

  constructor(url: string) {
    this.socket = new WebSocket(normalizeWsUrl(url));
    this.socket.binaryType = 'arraybuffer';
    this.socket.onmessage = (event) => this.handleMessage(event);
    this.socket.addEventListener('close', () => {
      this.closedListener?.();
    });
  }

  async waitReady(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = (error) => reject(error);
    });
  }

  async createGame(payload: Extract<ClientEvent, { type: 'create_game' }>['payload']): Promise<{ sessionId: string; state: GameState; hostName: string; guestName?: string }> {
    return new Promise<{ sessionId: string; state: GameState; hostName: string; guestName?: string }>((resolve, reject) => {
      this.pendingCreate = { resolve, reject };
      this.send({
        type: 'create_game',
        payload
      });
    });
  }

  async move(sessionId: string, move: MoveInput): Promise<{ diffs: GameDiff[]; gameOver: boolean; winner?: GameWinner }> {
    return new Promise<{ diffs: GameDiff[]; gameOver: boolean; winner?: GameWinner }>((resolve, reject) => {
      const timer = setTimeout(() => {
        const current = this.pendingMove;
        this.pendingMove = undefined;
        resolve({
          diffs: current?.diffs ?? [],
          gameOver: false
        });
      }, 100);

      this.pendingMove = { sessionId, diffs: [], resolve, reject, timer };
      this.send({
        type: 'move',
        payload: {
          sessionId,
          move
        }
      });
    });
  }

  async joinGame(sessionId: string, playerName?: string): Promise<{ sessionId: string; state: GameState; hostName: string; guestName?: string }> {
    return new Promise<{ sessionId: string; state: GameState; hostName: string; guestName?: string }>((resolve, reject) => {
      this.pendingJoin = { resolve, reject };
      this.send({
        type: 'join_game',
        payload: { sessionId, playerName }
      });
    });
  }

  setReady(sessionId: string, ready: boolean): void {
    this.send({
      type: 'set_ready',
      payload: { sessionId, ready }
    });
  }

  startGame(sessionId: string): void {
    this.send({
      type: 'start_game',
      payload: { sessionId }
    });
  }

  requestRematch(sessionId: string): void {
    this.send({
      type: 'rematch',
      payload: { sessionId }
    });
  }

  onLobbyState(listener: (payload: Extract<ServerEvent, { type: 'lobby_state' }>['payload']) => void): void {
    this.lobbyStateListener = listener;
  }

  onGameStarted(listener: (payload: Extract<ServerEvent, { type: 'game_started' }>['payload']) => void): void {
    this.gameStartedListener = listener;
  }

  onStateDiff(listener: (payload: Extract<ServerEvent, { type: 'state_diff' }>['payload']) => void): void {
    this.stateDiffListener = listener;
  }

  onRematchStarted(listener: (payload: Extract<ServerEvent, { type: 'rematch_started' }>['payload']) => void): void {
    this.rematchStartedListener = listener;
  }

  onGameOver(listener: (payload: Extract<ServerEvent, { type: 'game_over' }>['payload']) => void): void {
    this.gameOverListener = listener;
  }

  onClosed(listener: () => void): void {
    this.closedListener = listener;
  }

  close(): void {
    if (this.socket.readyState === WebSocket.CLOSING || this.socket.readyState === WebSocket.CLOSED) {
      return;
    }
    this.socket.close();
  }

  isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  private handleMessage(event: MessageEvent<string | ArrayBuffer | Blob>): void {
    if (event.data instanceof ArrayBuffer) {
      this.handleBinaryMessage(event.data);
      return;
    }

    if (event.data instanceof Blob) {
      void event.data
        .arrayBuffer()
        .then((buffer) => this.handleBinaryMessage(buffer))
        .catch((error) => {
          this.rejectPendingMove(error);
        });
      return;
    }

    let data: ServerEvent;
    try {
      data = JSON.parse(event.data) as ServerEvent;
    } catch (error) {
      this.rejectPendingMove(error);
      return;
    }

    if (data.type === 'error') {
      this.pendingCreate?.reject(new Error(data.payload.message));
      this.pendingJoin?.reject(new Error(data.payload.message));
      if (this.pendingMove) {
        clearTimeout(this.pendingMove.timer);
        this.pendingMove.reject(new Error(data.payload.message));
      }
      this.pendingCreate = undefined;
      this.pendingJoin = undefined;
      this.pendingMove = undefined;
      return;
    }

    if (data.type === 'game_created') {
      this.pendingCreate?.resolve({
        sessionId: data.payload.sessionId,
        state: hydrateGameState(data.payload.state),
        hostName: data.payload.hostName,
        guestName: data.payload.guestName
      });
      this.pendingCreate = undefined;
      return;
    }

    if (data.type === 'game_joined') {
      this.pendingJoin?.resolve({
        sessionId: data.payload.sessionId,
        state: hydrateGameState(data.payload.state),
        hostName: data.payload.hostName,
        guestName: data.payload.guestName
      });
      this.pendingJoin = undefined;
      return;
    }

    if (data.type === 'lobby_state') {
      this.lobbyStateListener?.(data.payload);
      return;
    }

    if (data.type === 'game_started') {
      this.gameStartedListener?.(data.payload);
      return;
    }

    if (data.type === 'rematch_started') {
      this.rematchStartedListener?.({
        ...data.payload,
        state: hydrateGameState(data.payload.state)
      });
      return;
    }

    if (data.type === 'game_over' && this.pendingMove) {
      if (data.payload.sessionId !== this.pendingMove.sessionId) return;
      clearTimeout(this.pendingMove.timer);
      this.pendingMove.resolve({ diffs: this.pendingMove.diffs, gameOver: true, winner: data.payload.winner });
      this.pendingMove = undefined;
    }
  }

  private send(event: ClientEvent): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket connection is not open');
    }
    this.socket.send(JSON.stringify(event));
  }

  private handleBinaryMessage(buffer: ArrayBuffer): void {
    let decoded:
      | { type: 'state_diff'; sessionId: string; diff: GameDiff }
      | { type: 'game_over'; sessionId: string; winner: GameWinner; turn: number };

    try {
      decoded = decodeServerBinaryFrame(buffer);
    } catch (error) {
      this.rejectPendingMove(error);
      return;
    }

    const isPendingMoveSession = !!this.pendingMove && decoded.sessionId === this.pendingMove.sessionId;

    if (decoded.type === 'state_diff') {
      if (isPendingMoveSession && this.pendingMove) {
        this.pendingMove.diffs.push(decoded.diff);
        this.reschedulePendingMoveSettle();
        return;
      }
      this.stateDiffListener?.({
        sessionId: decoded.sessionId,
        diff: decoded.diff
      });
      return;
    }

    if (isPendingMoveSession && this.pendingMove) {
      clearTimeout(this.pendingMove.timer);
      this.pendingMove.resolve({
        diffs: this.pendingMove.diffs,
        gameOver: true,
        winner: decoded.winner
      });
      this.pendingMove = undefined;
      return;
    }

    this.gameOverListener?.({
      sessionId: decoded.sessionId,
      winner: decoded.winner,
      turn: decoded.turn
    });
  }

  private rejectPendingMove(reason: unknown): void {
    if (!this.pendingMove) {
      return;
    }
    clearTimeout(this.pendingMove.timer);
    this.pendingMove.reject(reason instanceof Error ? reason : new Error('Failed to decode server message'));
    this.pendingMove = undefined;
  }

  private reschedulePendingMoveSettle(): void {
    if (!this.pendingMove) {
      return;
    }

    clearTimeout(this.pendingMove.timer);
    this.pendingMove.timer = setTimeout(() => {
      const current = this.pendingMove;
      this.pendingMove = undefined;
      current?.resolve({
        diffs: current.diffs,
        gameOver: false
      });
    }, 40);
  }
}

function normalizeWsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === '' || parsed.pathname === '/') {
      parsed.pathname = '/ws';
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function hydrateGameState(state: GameState): GameState {
  return {
    ...state,
    owner: toUint8Array(state.owner),
    color: toUint8Array(state.color),
    effect: toUint8Array(state.effect),
    playerColor: toUint8Array(state.playerColor),
    score: toUint16Array(state.score)
  };
}

function toUint8Array(value: Uint8Array | ArrayLike<number> | Record<string, number>): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  return Uint8Array.from(toNumberArray(value));
}

function toUint16Array(value: Uint16Array | ArrayLike<number> | Record<string, number>): Uint16Array {
  if (value instanceof Uint16Array) {
    return value;
  }

  return Uint16Array.from(toNumberArray(value));
}

function toNumberArray(value: ArrayLike<number> | Record<string, number>): number[] {
  const maybeArrayLike = value as ArrayLike<number>;
  if (typeof maybeArrayLike.length === 'number') {
    return Array.from(maybeArrayLike);
  }

  return Object.keys(value)
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => (value as Record<string, number>)[key]);
}
