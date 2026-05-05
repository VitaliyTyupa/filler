import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import { GameWinner, MoveInput } from '@game-core';
import { WebSocket } from 'ws';
import {
  CancelOpenGameJoinRequest,
  ClientEvent,
  ConfirmOpenGameJoinRequest,
  CreateGameRequest,
  encodeGameOverFrame,
  encodeStateDiffFrame,
  JoinGameRequest,
  MoveRequest,
  OpenGameStatus,
  PublishOpenGameRequest,
  RejectOpenGameJoinRequest,
  RematchRequest,
  RequestOpenGameJoinRequest,
  ServerEvent,
  StartGameRequest
} from '@shared';
import { OpenGamesService } from './open-games.service';
import { SessionManager } from './session-manager.service';

type SocketRole = 'host' | 'guest';

interface LobbyState {
  host?: WebSocket;
  guest?: WebSocket;
  started: boolean;
  published: boolean;
  joinStatus: OpenGameStatus;
  hostName: string;
  guestName?: string;
  createdAt: string;
  startedAt?: string;
  matchArchived: boolean;
  board: {
    cols: number;
    rows: number;
  };
  paletteSize: number;
  hostCountry?: string;
  guestCountry?: string;
}

@WebSocketGateway({
  path: '/ws'
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameGateway.name);
  private readonly allSockets = new Set<WebSocket>();
  private readonly roomSockets = new Map<string, Set<WebSocket>>();
  private readonly socketToSession = new Map<WebSocket, string>();
  private readonly socketRole = new Map<WebSocket, SocketRole>();
  private readonly roomState = new Map<string, LobbyState>();
  private reconcileTimer?: NodeJS.Timeout;

  constructor(
    @Inject(SessionManager) private readonly sessions: SessionManager,
    @Inject(OpenGamesService) private readonly openGamesService: OpenGamesService
  ) {}

  onModuleInit(): void {
    this.reconcileTimer = setInterval(() => {
      void this.reconcileOpenGames();
    }, 30_000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }

    await this.openGamesService.removeOpenGamesExcept([]);
  }

  handleConnection(socket: WebSocket): void {
    this.allSockets.add(socket);
    void this.sendOpenGamesSnapshot(socket);

    socket.on('message', async (message) => {
      const event = this.parseEvent(message.toString(), socket);
      if (!event) {
        return;
      }

      try {
        await this.handleEvent(socket, event);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Internal server error';
        this.send(socket, {
          type: 'error',
          payload: {
            code: 'INTERNAL_ERROR',
            message: messageText
          }
        });
      }
    });
  }

  handleDisconnect(socket: WebSocket): void {
    this.allSockets.delete(socket);
    void this.handleDisconnectAsync(socket);
  }

  private async handleDisconnectAsync(socket: WebSocket): Promise<void> {
    const sessionId = this.socketToSession.get(socket);
    if (!sessionId) {
      return;
    }

    const role = this.socketRole.get(socket);
    this.socketToSession.delete(socket);
    this.socketRole.delete(socket);
    this.removeSocketFromRoom(socket, sessionId);

    if (!role) {
      return;
    }

    const state = this.roomState.get(sessionId);
    if (!state) {
      return;
    }

    if (role === 'host') {
      state.host = undefined;

      if (state.started) {
        await this.archiveSession(sessionId, state, 'interrupted');
      }

      if (state.published) {
        await this.openGamesService.removeOpenGame(sessionId);
        await this.archiveSession(sessionId, state, 'interrupted');
        await this.sendOpenGamesSnapshot();
      }

      state.started = false;
      state.published = false;
      state.joinStatus = 'free';
      state.guest = undefined;
      state.guestName = undefined;
      this.broadcastLobbyState(sessionId);
      return;
    }

    state.guest = undefined;

    if (state.started) {
      await this.archiveSession(sessionId, state, 'interrupted');
      state.started = false;
      this.broadcastLobbyState(sessionId);
      return;
    }

    if (state.published && (state.joinStatus === 'joining' || state.joinStatus === 'confirmed')) {
      await this.openGamesService.resetToFree(sessionId);
      state.joinStatus = 'free';
      state.guestName = undefined;
      state.guestCountry = undefined;
      await this.sendOpenGamesSnapshot();
    }

    this.broadcastLobbyState(sessionId);
  }

  private parseEvent(raw: string, socket: WebSocket): ClientEvent | null {
    try {
      return JSON.parse(raw) as ClientEvent;
    } catch {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'BAD_PAYLOAD',
          message: 'Invalid payload'
        }
      });
      return null;
    }
  }

  private async handleEvent(socket: WebSocket, event: ClientEvent): Promise<void> {
    if (event.type === 'create_game') {
      this.handleCreateGame(socket, event);
      return;
    }

    if (event.type === 'publish_open_game') {
      await this.handlePublishOpenGame(socket, event);
      return;
    }

    if (event.type === 'request_open_game_join') {
      await this.handleRequestOpenGameJoin(socket, event);
      return;
    }

    if (event.type === 'cancel_open_game_join') {
      await this.handleCancelOpenGameJoin(socket, event);
      return;
    }

    if (event.type === 'confirm_open_game_join') {
      await this.handleConfirmOpenGameJoin(socket, event);
      return;
    }

    if (event.type === 'reject_open_game_join') {
      await this.handleRejectOpenGameJoin(socket, event);
      return;
    }

    if (event.type === 'move') {
      await this.handleMove(socket, event);
      return;
    }

    if (event.type === 'join_game') {
      this.handleJoinGame(socket, event);
      return;
    }

    if (event.type === 'start_game') {
      await this.handleStartGame(socket, event);
      return;
    }

    if (event.type === 'rematch') {
      this.handleRematch(socket, event);
      return;
    }

    this.send(socket, {
      type: 'error',
      payload: {
        code: 'UNKNOWN_EVENT',
        message: 'Unknown event'
      }
    });
  }

  private handleCreateGame(socket: WebSocket, event: CreateGameRequest): void {
    if (this.socketToSession.has(socket)) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'ALREADY_IN_LOBBY',
          message: 'Leave your current lobby before creating a new game'
        }
      });
      return;
    }

    const { sessionId, state } = this.sessions.createGame(event.payload);
    const hostName = this.normalizePlayerName(event.payload.playerName, 'Player 1');
    this.joinRoom(socket, sessionId, 'host');
    this.roomState.set(sessionId, {
      host: socket,
      guest: undefined,
      started: false,
      published: false,
      joinStatus: 'free',
      hostName,
      createdAt: new Date().toISOString(),
      matchArchived: false,
      board: {
        cols: state.cols,
        rows: state.rows
      },
      paletteSize: state.paletteSize,
      hostCountry: this.resolveCountry(socket)
    });
    this.send(socket, {
      type: 'game_created',
      payload: {
        sessionId,
        state,
        hostName
      }
    });
    this.broadcastLobbyState(sessionId);
  }

  private async handlePublishOpenGame(socket: WebSocket, event: PublishOpenGameRequest): Promise<void> {
    if (this.socketToSession.has(socket)) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'ALREADY_IN_LOBBY',
          message: 'Leave your current lobby before publishing a new game'
        }
      });
      return;
    }

    const { sessionId, state } = this.sessions.createGame(event.payload);
    const hostName = this.normalizePlayerName(event.payload.playerName, 'Player 1');
    const createdAt = new Date().toISOString();
    this.joinRoom(socket, sessionId, 'host');
    this.roomState.set(sessionId, {
      host: socket,
      guest: undefined,
      started: false,
      published: true,
      joinStatus: 'free',
      hostName,
      createdAt,
      matchArchived: false,
      board: {
        cols: state.cols,
        rows: state.rows
      },
      paletteSize: state.paletteSize,
      hostCountry: this.resolveCountry(socket)
    });

    await this.openGamesService.removeOpenGamesByHostName(hostName, sessionId);
    await this.openGamesService.publishGame({
      sessionId,
      mode: 'online',
      hostName,
      cols: state.cols,
      rows: state.rows,
      paletteSize: state.paletteSize,
      status: 'free',
      createdAt,
      hostCountry: this.resolveCountry(socket)
    });

    this.send(socket, {
      type: 'game_created',
      payload: {
        sessionId,
        state,
        hostName
      }
    });
    await this.sendOpenGamesSnapshot();
    this.broadcastLobbyState(sessionId);
  }

  private handleJoinGame(socket: WebSocket, event: JoinGameRequest): void {
    if (this.socketToSession.get(socket) === event.payload.sessionId) {
      const existingState = this.sessions.getState(event.payload.sessionId);
      if (!existingState) {
        this.sendSessionNotFound(socket);
        return;
      }

      this.send(socket, {
        type: 'game_joined',
        payload: {
          sessionId: event.payload.sessionId,
          state: existingState,
          hostName: this.roomState.get(event.payload.sessionId)?.hostName ?? 'Player 1',
          guestName: this.roomState.get(event.payload.sessionId)?.guestName
        }
      });
      this.broadcastLobbyState(event.payload.sessionId);
      return;
    }

    const state = this.sessions.getState(event.payload.sessionId);
    if (!state) {
      this.sendSessionNotFound(socket);
      return;
    }

    const room = this.roomState.get(event.payload.sessionId);
    if (!room) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'ROOM_NOT_FOUND',
          message: 'Room not found'
        }
      });
      return;
    }

    if (room.started) {
      this.joinRoom(socket, event.payload.sessionId, 'guest');
      room.guest = socket;
      room.guestName = this.normalizePlayerName(event.payload.playerName, room.guestName ?? 'Player 2');
      this.send(socket, {
        type: 'game_joined',
        payload: {
          sessionId: event.payload.sessionId,
          state,
          hostName: room.hostName,
          guestName: room.guestName
        }
      });
      this.broadcastLobbyState(event.payload.sessionId);
      return;
    }

    this.send(socket, {
      type: 'error',
      payload: {
        code: 'JOIN_BY_CODE_DISABLED',
        message: 'Use published open games list to join a lobby'
      }
    });
  }

  private async handleRequestOpenGameJoin(socket: WebSocket, event: RequestOpenGameJoinRequest): Promise<void> {
    const sessionId = event.payload.sessionId;
    const existingSessionId = this.socketToSession.get(socket);
    if (existingSessionId && existingSessionId !== sessionId) {
      const existingRole = this.socketRole.get(socket);
      const existingLobby = this.roomState.get(existingSessionId);
      const canAbandonPublishedLobby = existingRole === 'host'
        && !!existingLobby
        && existingLobby.published
        && !existingLobby.started;

      if (!canAbandonPublishedLobby || !existingLobby) {
        this.send(socket, {
          type: 'error',
          payload: {
            code: 'ALREADY_IN_LOBBY',
            message: 'Leave your current lobby before joining another game'
          }
        });
        return;
      }

      await this.abandonPublishedLobby(socket, existingSessionId, existingLobby);
    }

    const state = this.sessions.getState(sessionId);
    const lobby = this.roomState.get(sessionId);
    if (!state || !lobby || !lobby.published) {
      this.sendSessionNotFound(socket);
      return;
    }

    if (lobby.started || lobby.joinStatus !== 'free' || lobby.guest) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'GAME_NOT_FREE',
          message: 'This game is no longer available'
        }
      });
      return;
    }

    const guestName = this.normalizePlayerName(event.payload.playerName, 'Player 2');
    const updated = await this.openGamesService.setJoining(sessionId, guestName, this.resolveCountry(socket));
    if (!updated) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'GAME_NOT_FREE',
          message: 'This game is no longer available'
        }
      });
      return;
    }

    this.joinRoom(socket, sessionId, 'guest');
    lobby.guest = socket;
    lobby.guestName = guestName;
    lobby.guestCountry = this.resolveCountry(socket);
    lobby.joinStatus = 'joining';

    this.send(socket, {
      type: 'game_joined',
      payload: {
        sessionId,
        state,
        hostName: lobby.hostName,
        guestName
      }
    });
    await this.sendOpenGamesSnapshot();
    this.broadcastLobbyState(sessionId);
  }

  private async handleCancelOpenGameJoin(socket: WebSocket, event: CancelOpenGameJoinRequest): Promise<void> {
    const sessionId = event.payload.sessionId;
    const lobby = this.roomState.get(sessionId);
    const role = this.socketRole.get(socket);
    if (!lobby || role !== 'guest' || this.socketToSession.get(socket) !== sessionId || !lobby.published) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_CANCEL',
          message: 'There is no active join request to cancel'
        }
      });
      return;
    }

    if (lobby.joinStatus !== 'joining' && lobby.joinStatus !== 'confirmed') {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_CANCEL',
          message: 'There is no active join request to cancel'
        }
      });
      return;
    }

    const reset = await this.openGamesService.resetToFree(sessionId);
    if (!reset) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_CANCEL',
          message: 'Join request is no longer active'
        }
      });
      return;
    }

    this.detachGuest(socket, sessionId, lobby);
    await this.sendOpenGamesSnapshot();
    this.broadcastLobbyState(sessionId);
  }

  private async handleConfirmOpenGameJoin(socket: WebSocket, event: ConfirmOpenGameJoinRequest): Promise<void> {
    const sessionId = event.payload.sessionId;
    const lobby = this.roomState.get(sessionId);
    const role = this.socketRole.get(socket);
    if (!lobby || role !== 'host' || this.socketToSession.get(socket) !== sessionId || !lobby.published) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_CONFIRM',
          message: 'Join request cannot be confirmed'
        }
      });
      return;
    }

    if (lobby.joinStatus !== 'joining' || !lobby.guest || !lobby.guestName) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_CONFIRM',
          message: 'Join request is no longer pending'
        }
      });
      return;
    }

    const confirmed = await this.openGamesService.confirmJoin(sessionId);
    if (!confirmed) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_CONFIRM',
          message: 'Join request is no longer pending'
        }
      });
      return;
    }

    lobby.joinStatus = 'confirmed';
    await this.sendOpenGamesSnapshot();
    this.broadcastLobbyState(sessionId);
  }

  private async handleRejectOpenGameJoin(socket: WebSocket, event: RejectOpenGameJoinRequest): Promise<void> {
    const sessionId = event.payload.sessionId;
    const lobby = this.roomState.get(sessionId);
    const role = this.socketRole.get(socket);
    if (!lobby || role !== 'host' || this.socketToSession.get(socket) !== sessionId || !lobby.published) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_REJECT',
          message: 'Join request cannot be rejected'
        }
      });
      return;
    }

    if ((lobby.joinStatus !== 'joining' && lobby.joinStatus !== 'confirmed') || !lobby.guest) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_REJECT',
          message: 'Join request is no longer active'
        }
      });
      return;
    }

    const reset = await this.openGamesService.resetToFree(sessionId);
    if (!reset) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'INVALID_REJECT',
          message: 'Join request is no longer active'
        }
      });
      return;
    }

    this.detachGuest(lobby.guest, sessionId, lobby);
    await this.sendOpenGamesSnapshot();
    this.broadcastLobbyState(sessionId);
  }

  private async handleMove(socket: WebSocket, event: MoveRequest): Promise<void> {
    const currentSession = this.socketToSession.get(socket);
    if (currentSession !== event.payload.sessionId) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'SESSION_MISMATCH',
          message: 'Socket is not attached to this session'
        }
      });
      return;
    }

    const lobby = this.roomState.get(event.payload.sessionId);
    const role = this.socketRole.get(socket);
    if (lobby && role) {
      const expectedPlayerId = role === 'host' ? 1 : 2;
      if (event.payload.move.playerId !== expectedPlayerId) {
        this.send(socket, {
          type: 'error',
          payload: {
            code: 'ROLE_MISMATCH',
            message: 'Move playerId does not match socket role'
          }
        });
        return;
      }
    }

    if (lobby && !lobby.started && lobby.guest) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'GAME_NOT_STARTED',
          message: 'Game has not been started by host yet'
        }
      });
      return;
    }

    const result = this.sessions.handleMove(event.payload.sessionId, event.payload.move);
    if (!result) {
      this.sendSessionNotFound(socket);
      return;
    }

    if (!result.diffs.length) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'MOVE_REJECTED',
          message: 'Move rejected by server'
        }
      });
      return;
    }

    for (const diff of result.diffs) {
      this.broadcast(result.sessionId, encodeStateDiffFrame(result.sessionId, diff));
    }

    if (result.gameOver && result.winner) {
      this.broadcast(result.sessionId, encodeGameOverFrame(result.sessionId, {
        winner: result.winner,
        turn: result.state.turn
      }));

      if (lobby) {
        await this.archiveSession(result.sessionId, lobby, 'finished', result.winner);
      }
    }
  }

  private async handleStartGame(socket: WebSocket, event: StartGameRequest): Promise<void> {
    const sessionId = event.payload.sessionId;
    const lobby = this.roomState.get(sessionId);
    const role = this.socketRole.get(socket);
    if (!lobby || role !== 'host' || this.socketToSession.get(socket) !== sessionId) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'NOT_IN_ROOM',
          message: 'Socket is not in room'
        }
      });
      return;
    }

    const canStart = !!lobby.host && !!lobby.guest && lobby.joinStatus === 'confirmed';
    if (!canStart) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'NOT_READY',
          message: 'Guest request must be confirmed before starting the game'
        }
      });
      return;
    }

    await this.openGamesService.removeOpenGame(sessionId);
    lobby.published = false;
    lobby.started = true;
    lobby.startedAt = new Date().toISOString();
    lobby.matchArchived = false;
    this.broadcastLobbyState(sessionId);
    const state = this.sessions.getState(sessionId);
    this.sendToRoom(sessionId, {
      type: 'game_started',
      payload: {
        sessionId,
        turn: state?.turn ?? 0,
        hostName: lobby.hostName,
        guestName: lobby.guestName
      }
    });
    await this.sendOpenGamesSnapshot();
  }

  private handleRematch(socket: WebSocket, event: RematchRequest): void {
    const sessionId = event.payload.sessionId;
    const lobby = this.roomState.get(sessionId);
    if (!lobby || this.socketToSession.get(socket) !== sessionId) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'NOT_IN_ROOM',
          message: 'Socket is not in room'
        }
      });
      return;
    }

    if (!lobby.host || !lobby.guest) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'REMATCH_UNAVAILABLE',
          message: 'Both players must be connected for a rematch'
        }
      });
      return;
    }

    const state = this.sessions.recreateGame(sessionId);
    if (!state) {
      this.sendSessionNotFound(socket);
      return;
    }

    lobby.started = true;
    lobby.startedAt = new Date().toISOString();
    lobby.matchArchived = false;
    this.broadcastLobbyState(sessionId);
    this.sendToRoom(sessionId, {
      type: 'rematch_started',
      payload: {
        sessionId,
        state,
        hostName: lobby.hostName,
        guestName: lobby.guestName
      }
    });
  }

  private sendSessionNotFound(socket: WebSocket): void {
    this.send(socket, {
      type: 'error',
      payload: {
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found'
      }
    });
  }

  private send(socket: WebSocket, event: ServerEvent): void {
    socket.send(JSON.stringify(event));
  }

  private joinRoom(socket: WebSocket, sessionId: string, role: SocketRole): void {
    const prevSessionId = this.socketToSession.get(socket);
    if (prevSessionId && prevSessionId !== sessionId) {
      this.removeSocketFromRoom(socket, prevSessionId);
    }

    this.socketToSession.set(socket, sessionId);
    this.socketRole.set(socket, role);
    const room = this.roomSockets.get(sessionId) ?? new Set<WebSocket>();
    room.add(socket);
    this.roomSockets.set(sessionId, room);
  }

  private removeSocketFromRoom(socket: WebSocket, sessionId: string): void {
    const room = this.roomSockets.get(sessionId);
    room?.delete(socket);
    if (room && room.size === 0) {
      this.roomSockets.delete(sessionId);
    }
  }

  private detachGuest(socket: WebSocket, sessionId: string, lobby: LobbyState): void {
    this.removeSocketFromRoom(socket, sessionId);
    this.socketToSession.delete(socket);
    this.socketRole.delete(socket);
    lobby.guest = undefined;
    lobby.guestName = undefined;
    lobby.guestCountry = undefined;
    lobby.joinStatus = 'free';
  }

  private async abandonPublishedLobby(hostSocket: WebSocket, sessionId: string, lobby: LobbyState): Promise<void> {
    await this.openGamesService.removeOpenGame(sessionId);

    if (lobby.guest) {
      this.detachGuest(lobby.guest, sessionId, lobby);
    }

    this.removeSocketFromRoom(hostSocket, sessionId);
    this.socketToSession.delete(hostSocket);
    this.socketRole.delete(hostSocket);
    lobby.host = undefined;
    lobby.started = false;
    lobby.published = false;
    lobby.joinStatus = 'free';
    lobby.guest = undefined;
    lobby.guestName = undefined;
    lobby.guestCountry = undefined;
    this.roomState.delete(sessionId);
  }

  private broadcast(sessionId: string, payload: string | ArrayBuffer): void {
    const room = this.roomSockets.get(sessionId);
    if (!room?.size) {
      return;
    }

    for (const socket of room) {
      socket.send(payload);
    }
  }

  private sendToRoom(sessionId: string, event: ServerEvent): void {
    const room = this.roomSockets.get(sessionId);
    if (!room?.size) {
      return;
    }

    const encoded = JSON.stringify(event);
    for (const socket of room) {
      socket.send(encoded);
    }
  }

  private broadcastLobbyState(sessionId: string): void {
    const lobby = this.roomState.get(sessionId);
    if (!lobby) {
      return;
    }

    const hostConnected = !!lobby.host;
    const guestConnected = !!lobby.guest;
    const canStart = hostConnected && guestConnected && lobby.joinStatus === 'confirmed';

    this.sendToRoom(sessionId, {
      type: 'lobby_state',
      payload: {
        sessionId,
        hostConnected,
        guestConnected,
        canStart,
        started: lobby.started,
        published: lobby.published,
        openGameStatus: lobby.published ? lobby.joinStatus : undefined,
        hostName: lobby.hostName,
        guestName: lobby.guestName
      }
    });
  }

  private async sendOpenGamesSnapshot(target?: WebSocket): Promise<void> {
    await this.reconcileOpenGames();
    const games = await this.openGamesService.listOpenGames();
    const event: ServerEvent = {
      type: 'open_games_snapshot',
      payload: { games }
    };

    if (target) {
      this.send(target, event);
      return;
    }

    for (const socket of this.allSockets) {
      this.send(socket, event);
    }
  }

  private async archiveSession(
    sessionId: string,
    lobby: LobbyState,
    resultType: 'finished' | 'interrupted',
    winner?: GameWinner
  ): Promise<void> {
    if (lobby.matchArchived) {
      return;
    }

    const state = this.sessions.getState(sessionId);
    const endedAt = new Date().toISOString();
    const durationSeconds = lobby.startedAt
      ? Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(lobby.startedAt)) / 1000))
      : 0;

    await this.openGamesService.archiveClosedGame({
      sessionId,
      mode: 'online',
      hostName: lobby.hostName,
      guestName: lobby.guestName,
      board: lobby.board,
      paletteSize: lobby.paletteSize,
      resultType,
      winner: winner?.winner ?? null,
      score1: winner?.score1 ?? state?.score[1] ?? 0,
      score2: winner?.score2 ?? state?.score[2] ?? 0,
      movesCount: state?.turn ?? 0,
      startedAt: lobby.startedAt,
      endedAt,
      durationSeconds,
      hostCountry: lobby.hostCountry,
      guestCountry: lobby.guestCountry
    });

    lobby.matchArchived = true;
  }

  private normalizePlayerName(name: string | undefined, fallback: string): string {
    const trimmed = name?.trim();
    return trimmed ? trimmed : fallback;
  }

  private resolveCountry(_socket: WebSocket): string | undefined {
    return undefined;
  }

  private async reconcileOpenGames(): Promise<void> {
    const livePublishedSessionIds: string[] = [];

    for (const [sessionId, lobby] of this.roomState.entries()) {
      if (!lobby.published) {
        continue;
      }

      const hostSocket = lobby.host;
      const hostStillAttached = !!hostSocket
        && hostSocket.readyState === WebSocket.OPEN
        && this.socketToSession.get(hostSocket) === sessionId
        && this.socketRole.get(hostSocket) === 'host';

      if (!hostStillAttached) {
        lobby.host = undefined;
        lobby.guest = undefined;
        lobby.guestName = undefined;
        lobby.guestCountry = undefined;
        lobby.started = false;
        lobby.published = false;
        lobby.joinStatus = 'free';
        continue;
      }

      livePublishedSessionIds.push(sessionId);
      await this.openGamesService.touchOpenGame(sessionId);
    }

    const deletedCount = await this.openGamesService.removeOpenGamesExcept(livePublishedSessionIds);
    if (deletedCount > 0) {
      this.logger.warn(`Removed ${deletedCount} stale open game entries during reconcile`);
    }
  }
}
