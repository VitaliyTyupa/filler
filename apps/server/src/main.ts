import { WebSocketServer, WebSocket } from 'ws';
import {
  ClientEvent,
  CreateGameRequest,
  encodeGameOverFrame,
  encodeStateDiffFrame,
  JoinGameRequest,
  MoveRequest,
  SetReadyRequest,
  StartGameRequest,
  ServerEvent
} from '@shared';
import { SessionManager } from './session-manager';

const PORT = Number(process.env.PORT ?? 8080);
const wss = new WebSocketServer({ port: PORT });
const sessions = new SessionManager();
const roomSockets = new Map<string, Set<WebSocket>>();
const socketToSession = new Map<WebSocket, string>();
const socketRole = new Map<WebSocket, 'host' | 'guest'>();
const roomState = new Map<string, {
  host?: WebSocket;
  guest?: WebSocket;
  hostReady: boolean;
  guestReady: boolean;
  started: boolean;
  hostName: string;
  guestName?: string;
}>();

wss.on('connection', (socket) => {
  socket.on('message', (message) => {
    let event: ClientEvent;
    try {
      const raw = message.toString();
      event = JSON.parse(raw) as ClientEvent;
    } catch {
      send(socket, {
        type: 'error',
        payload: {
          code: 'BAD_PAYLOAD',
          message: 'Invalid payload'
        }
      });
      return;
    }

    try {
      handleEvent(socket, event);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      send(socket, {
        type: 'error',
        payload: {
          code: 'INTERNAL_ERROR',
          message
        }
      });
    }
  });

  socket.on('close', () => {
    const sessionId = socketToSession.get(socket);
    if (!sessionId) {
      return;
    }
    const role = socketRole.get(socket);
    socketToSession.delete(socket);
    socketRole.delete(socket);
    const room = roomSockets.get(sessionId);
    room?.delete(socket);
    if (room && room.size === 0) {
      roomSockets.delete(sessionId);
    }

    if (role) {
      const state = roomState.get(sessionId);
      if (state) {
        if (role === 'host') {
          state.host = undefined;
          state.hostReady = false;
        } else {
          state.guest = undefined;
          state.guestReady = false;
        }
        state.started = false;
        broadcastLobbyState(sessionId);
      }
    }
  });
});

function handleEvent(socket: WebSocket, event: ClientEvent): void {
  if (event.type === 'create_game') {
    handleCreateGame(socket, event);
    return;
  }

  if (event.type === 'move') {
    handleMove(socket, event);
    return;
  }

  if (event.type === 'join_game') {
    handleJoinGame(socket, event);
    return;
  }

  if (event.type === 'set_ready') {
    handleSetReady(socket, event);
    return;
  }

  if (event.type === 'start_game') {
    handleStartGame(socket, event);
    return;
  }

  send(socket, {
    type: 'error',
    payload: {
      code: 'UNKNOWN_EVENT',
      message: 'Unknown event'
    }
  });
}

function handleCreateGame(socket: WebSocket, event: CreateGameRequest): void {
  const { sessionId, state } = sessions.createGame(event.payload);
  const hostName = normalizePlayerName(event.payload.playerName, 'Player 1');
  joinRoom(socket, sessionId, 'host');
  roomState.set(sessionId, {
    host: socket,
    guest: undefined,
    hostReady: false,
    guestReady: false,
    started: false,
    hostName
  });
  send(socket, {
    type: 'game_created',
    payload: {
      sessionId,
      state,
      hostName
    }
  });
  broadcastLobbyState(sessionId);
}

function handleJoinGame(socket: WebSocket, event: JoinGameRequest): void {
  if (socketToSession.get(socket) === event.payload.sessionId) {
    const existingState = sessions.getState(event.payload.sessionId);
    if (!existingState) {
      send(socket, {
        type: 'error',
        payload: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        }
      });
      return;
    }

    send(socket, {
      type: 'game_joined',
      payload: {
        sessionId: event.payload.sessionId,
        state: existingState,
        hostName: roomState.get(event.payload.sessionId)?.hostName ?? 'Player 1',
        guestName: roomState.get(event.payload.sessionId)?.guestName
      }
    });
    broadcastLobbyState(event.payload.sessionId);
    return;
  }

  const state = sessions.getState(event.payload.sessionId);
  if (!state) {
    send(socket, {
      type: 'error',
      payload: {
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found'
      }
    });
    return;
  }

  const room = roomState.get(event.payload.sessionId);
  if (!room) {
    send(socket, {
      type: 'error',
      payload: {
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found'
      }
    });
    return;
  }

  if (room.guest && room.guest !== socket) {
    send(socket, {
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
  room.guestName = normalizePlayerName(event.payload.playerName, 'Player 2');
  joinRoom(socket, event.payload.sessionId, 'guest');
  send(socket, {
    type: 'game_joined',
    payload: {
      sessionId: event.payload.sessionId,
      state,
      hostName: room.hostName,
      guestName: room.guestName
    }
  });
  broadcastLobbyState(event.payload.sessionId);
}

function handleMove(socket: WebSocket, event: MoveRequest): void {
  const currentSession = socketToSession.get(socket);
  if (currentSession !== event.payload.sessionId) {
    send(socket, {
      type: 'error',
      payload: {
        code: 'SESSION_MISMATCH',
        message: 'Socket is not attached to this session'
      }
    });
    return;
  }

  const lobby = roomState.get(event.payload.sessionId);
  const role = socketRole.get(socket);
  if (lobby && role) {
    const expectedPlayerId = role === 'host' ? 1 : 2;
    if (event.payload.move.playerId !== expectedPlayerId) {
      send(socket, {
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
    send(socket, {
      type: 'error',
      payload: {
        code: 'GAME_NOT_STARTED',
        message: 'Both players must be ready and game must be started'
      }
    });
    return;
  }

  const result = sessions.handleMove(event.payload.sessionId, event.payload.move);
  if (!result) {
    send(socket, {
      type: 'error',
      payload: {
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found'
      }
    });
    return;
  }

  if (!result.diffs.length) {
    send(socket, {
      type: 'error',
      payload: {
        code: 'MOVE_REJECTED',
        message: 'Move rejected by server'
      }
    });
    return;
  }

  for (const diff of result.diffs) {
    broadcast(result.sessionId, encodeStateDiffFrame(result.sessionId, diff));
  }

  if (result.gameOver && result.winner) {
    broadcast(result.sessionId, encodeGameOverFrame(result.sessionId, {
      winner: result.winner,
      turn: result.state.turn
    }));
  }
}

function handleSetReady(socket: WebSocket, event: SetReadyRequest): void {
  const sessionId = event.payload.sessionId;
  const role = socketRole.get(socket);
  const lobby = roomState.get(sessionId);
  if (!role || !lobby || socketToSession.get(socket) !== sessionId) {
    send(socket, {
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
  broadcastLobbyState(sessionId);
}

function handleStartGame(socket: WebSocket, event: StartGameRequest): void {
  const sessionId = event.payload.sessionId;
  const lobby = roomState.get(sessionId);
  if (!lobby || socketToSession.get(socket) !== sessionId) {
    send(socket, {
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
    send(socket, {
      type: 'error',
      payload: {
        code: 'NOT_READY',
        message: 'Both players must be connected and ready'
      }
    });
    return;
  }

  lobby.started = true;
  broadcastLobbyState(sessionId);
  const state = sessions.getState(sessionId);
  sendToRoom(sessionId, {
    type: 'game_started',
    payload: {
      sessionId,
      turn: state?.turn ?? 0,
      hostName: lobby.hostName,
      guestName: lobby.guestName
    }
  });
}

function send(socket: WebSocket, event: ServerEvent): void {
  socket.send(JSON.stringify(event));
}

function joinRoom(socket: WebSocket, sessionId: string, role: 'host' | 'guest'): void {
  const prevSessionId = socketToSession.get(socket);
  const prevRole = socketRole.get(socket);
  if (prevSessionId && prevSessionId !== sessionId) {
    const prevRoom = roomSockets.get(prevSessionId);
    prevRoom?.delete(socket);
    if (prevRoom && prevRoom.size === 0) {
      roomSockets.delete(prevSessionId);
    }

    if (prevRole) {
      const prevState = roomState.get(prevSessionId);
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
        broadcastLobbyState(prevSessionId);
      }
    }
  }

  socketToSession.set(socket, sessionId);
  socketRole.set(socket, role);
  const room = roomSockets.get(sessionId) ?? new Set<WebSocket>();
  room.add(socket);
  roomSockets.set(sessionId, room);
}

function broadcast(sessionId: string, payload: string | ArrayBuffer): void {
  const room = roomSockets.get(sessionId);
  if (!room?.size) {
    return;
  }
  for (const socket of room) {
    socket.send(payload);
  }
}

function sendToRoom(sessionId: string, event: ServerEvent): void {
  const room = roomSockets.get(sessionId);
  if (!room?.size) {
    return;
  }
  const encoded = JSON.stringify(event);
  for (const socket of room) {
    socket.send(encoded);
  }
}

function broadcastLobbyState(sessionId: string): void {
  const lobby = roomState.get(sessionId);
  if (!lobby) {
    return;
  }

  const hostConnected = !!lobby.host;
  const guestConnected = !!lobby.guest;
  const canStart = hostConnected && guestConnected && lobby.hostReady && lobby.guestReady;

  sendToRoom(sessionId, {
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

function normalizePlayerName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : fallback;
}

console.log(`WS game server is listening on ws://localhost:${PORT}`);
