import crypto from 'node:crypto';

import {
  applyMove,
  generateInitialState,
  getValidMoves,
  getWinner,
  isGameOver,
  type GameResult,
  type GameSettings,
  type GameState,
  type PlayerId
} from '@filler/shared/engine';

export interface Room {
  id: string;
  state: GameState;
  settings: GameSettings;
  players: Set<PlayerId>;
  createdAt: number;
}

export interface MoveResult {
  state: GameState;
  validMoves: boolean[];
  gameOver: boolean;
  result?: GameResult;
}

export class RoomStore {
  private rooms = new Map<string, Room>();

  create(settings: GameSettings): Room {
    const room: Room = {
      id: crypto.randomUUID(),
      state: generateInitialState(settings),
      settings,
      players: new Set<PlayerId>(),
      createdAt: Date.now()
    };

    this.rooms.set(room.id, room);
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  join(roomId: string): { room: Room; playerId: PlayerId } | undefined {
    const room = this.rooms.get(roomId);
    if (!room) {
      return undefined;
    }

    const playerId: PlayerId | undefined = room.players.has(1) ? (room.players.has(2) ? undefined : 2) : 1;

    if (!playerId) {
      return undefined;
    }

    room.players.add(playerId);
    return { room, playerId };
  }

  applyMove(roomId: string, playerId: PlayerId, colorIndex: number): MoveResult | undefined {
    const room = this.rooms.get(roomId);
    if (!room) {
      return undefined;
    }

    room.state = applyMove(room.state, playerId, colorIndex);

    const validMoves = getValidMoves(room.state, room.state.currentPlayer);
    const gameOver = isGameOver(room.state);
    const result = gameOver ? getWinner(room.state) : undefined;

    return {
      state: room.state,
      validMoves,
      gameOver,
      result
    };
  }
}
