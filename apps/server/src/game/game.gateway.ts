import { Inject } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import { WebSocket } from 'ws';
import {
  ClientEvent,
  CreateGameRequest,
  encodeGameOverFrame,
  encodeStateDiffFrame,
  JoinGameRequest,
  MoveRequest,
  ServerEvent,
  SetReadyRequest,
  StartGameRequest
} from '@shared';
import { SessionManager } from './session-manager.service';

type SocketRole = 'host' | 'guest';

interface LobbyState {
  host?: WebSocket;
  guest?: WebSocket;
  hostReady: boolean;
  guestReady: boolean;
  started: boolean;
  hostName: string;
  guestName?: string;
}

@WebSocketGateway({
  path: '/ws'
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly roomSockets = new Map<string, Set<WebSocket>>();
  private readonly socketToSession = new Map<WebSocket, string>();
  private readonly socketRole = new Map<WebSocket, SocketRole>();
  private readonly roomState = new Map<string, LobbyState>();

  constructor(@Inject(SessionManager) private readonly sessions: SessionManager) {}

  handleConnection(socket: WebSocket): void {
    socket.on('message', (message) => {
      const event = this.parseEvent(message.toString(), socket);
      if (!event) {
        return;
      }

      try {
        this.handleEvent(socket, event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        this.send(socket, {
          type: 'error',
          payload: {
            code: 'INTERNAL_ERROR',
            message
          }
        });
      }
    });
  }

  handleDisconnect(socket: WebSocket): void {
    const sessionId = this.socketToSession.get(socket);
    if (!sessionId) {
      return;
    }

    const role = this.socketRole.get(socket);
    this.socketToSession.delete(socket);
    this.socketRole.delete(socket);

    const room = this.roomSockets.get(sessionId);
    room?.delete(socket);
    if (room && room.size === 0) {
      this.roomSockets.delete(sessionId);
    }

    if (role) {
      const state = this.roomState.get(sessionId);
      if (state) {
        if (role === 'host') {
          state.host = undefined;
          state.hostReady = false;
        } else {
          state.guest = undefined;
          state.guestReady = false;
        }
        state.started = false;
        this.broadcastLobbyState(sessionId);
      }
    }
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

  private handleEvent(socket: WebSocket, event: ClientEvent): void {
    if (event.type === 'create_game') {
      this.handleCreateGame(socket, event);
      return;
    }

    if (event.type === 'move') {
      this.handleMove(socket, event);
      return;
    }

    if (event.type === 'join_game') {
      this.handleJoinGame(socket, event);
      return;
    }

    if (event.type === 'set_ready') {
      this.handleSetReady(socket, event);
      return;
    }

    if (event.type === 'start_game') {
      this.handleStartGame(socket, event);
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
    const { sessionId, state } = this.sessions.createGame(event.payload);
    const hostName = this.normalizePlayerName(event.payload.playerName, 'Player 1');
    this.joinRoom(socket, sessionId, 'host');
    this.roomState.set(sessionId, {
      host: socket,
      guest: undefined,
      hostReady: false,
      guestReady: false,
      started: false,
      hostName
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

    if (room.guest && room.guest !== socket) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'ROOM_FULL',
          message: 'Room already has guest'
        }
      });
      return;
    }

    room.guest = socket;
    room.guestReady = false;
    room.started = false;
    room.guestName = this.normalizePlayerName(event.payload.playerName, 'Player 2');
    this.joinRoom(socket, event.payload.sessionId, 'guest');
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
  }

  private handleMove(socket: WebSocket, event: MoveRequest): void {
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
          message: 'Both players must be ready and game must be started'
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
    }
  }

  private handleSetReady(socket: WebSocket, event: SetReadyRequest): void {
    const sessionId = event.payload.sessionId;
    const role = this.socketRole.get(socket);
    const lobby = this.roomState.get(sessionId);
    if (!role || !lobby || this.socketToSession.get(socket) !== sessionId) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'NOT_IN_ROOM',
          message: 'Socket is not in room'
        }
      });
      return;
    }

    if (role === 'host') {
      lobby.hostReady = event.payload.ready;
    } else {
      lobby.guestReady = event.payload.ready;
    }
    this.broadcastLobbyState(sessionId);
  }

  private handleStartGame(socket: WebSocket, event: StartGameRequest): void {
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

    const canStart = !!lobby.host && !!lobby.guest && lobby.hostReady && lobby.guestReady;
    if (!canStart) {
      this.send(socket, {
        type: 'error',
        payload: {
          code: 'NOT_READY',
          message: 'Both players must be connected and ready'
        }
      });
      return;
    }

    lobby.started = true;
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
    const prevRole = this.socketRole.get(socket);
    if (prevSessionId && prevSessionId !== sessionId) {
      const prevRoom = this.roomSockets.get(prevSessionId);
      prevRoom?.delete(socket);
      if (prevRoom && prevRoom.size === 0) {
        this.roomSockets.delete(prevSessionId);
      }

      if (prevRole) {
        const prevState = this.roomState.get(prevSessionId);
        if (prevState) {
          if (prevRole === 'host' && prevState.host === socket) {
            prevState.host = undefined;
            prevState.hostReady = false;
            prevState.started = false;
          }
          if (prevRole === 'guest' && prevState.guest === socket) {
            prevState.guest = undefined;
            prevState.guestReady = false;
            prevState.started = false;
          }
          this.broadcastLobbyState(prevSessionId);
        }
      }
    }

    this.socketToSession.set(socket, sessionId);
    this.socketRole.set(socket, role);
    const room = this.roomSockets.get(sessionId) ?? new Set<WebSocket>();
    room.add(socket);
    this.roomSockets.set(sessionId, room);
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
    const canStart = hostConnected && guestConnected && lobby.hostReady && lobby.guestReady;

    this.sendToRoom(sessionId, {
      type: 'lobby_state',
      payload: {
        sessionId,
        hostConnected,
        guestConnected,
        hostReady: lobby.hostReady,
        guestReady: lobby.guestReady,
        canStart,
        started: lobby.started,
        hostName: lobby.hostName,
        guestName: lobby.guestName
      }
    });
  }

  private normalizePlayerName(name: string | undefined, fallback: string): string {
    const trimmed = name?.trim();
    return trimmed ? trimmed : fallback;
  }
}
