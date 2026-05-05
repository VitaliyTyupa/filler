import { GameDiff, GameState, GameWinner, MoveInput, PlayerId } from '@game-core';

export type SessionId = string;

export interface CreateGameRequest {
  type: 'create_game';
  payload: {
    cols: number;
    rows: number;
    paletteSize: number;
    seed: number;
    playerName?: string;
    cpuPlayerId?: PlayerId;
    cpuDifficulty?: 'standard' | 'master' | 'champion' | 'ultra';
  };
}

export interface PublishOpenGameRequest {
  type: 'publish_open_game';
  payload: {
    cols: number;
    rows: number;
    paletteSize: number;
    seed: number;
    playerName?: string;
  };
}

export interface MoveRequest {
  type: 'move';
  payload: {
    sessionId: SessionId;
    move: MoveInput;
  };
}

export interface JoinGameRequest {
  type: 'join_game';
  payload: {
    sessionId: SessionId;
    playerName?: string;
  };
}

export interface RequestOpenGameJoinRequest {
  type: 'request_open_game_join';
  payload: {
    sessionId: SessionId;
    playerName?: string;
  };
}

export interface CancelOpenGameJoinRequest {
  type: 'cancel_open_game_join';
  payload: {
    sessionId: SessionId;
  };
}

export interface ConfirmOpenGameJoinRequest {
  type: 'confirm_open_game_join';
  payload: {
    sessionId: SessionId;
  };
}

export interface RejectOpenGameJoinRequest {
  type: 'reject_open_game_join';
  payload: {
    sessionId: SessionId;
  };
}

export interface SetReadyRequest {
  type: 'set_ready';
  payload: {
    sessionId: SessionId;
    ready: boolean;
  };
}

export interface StartGameRequest {
  type: 'start_game';
  payload: {
    sessionId: SessionId;
  };
}

export interface RematchRequest {
  type: 'rematch';
  payload: {
    sessionId: SessionId;
  };
}

export type ClientEvent =
  | CreateGameRequest
  | PublishOpenGameRequest
  | MoveRequest
  | JoinGameRequest
  | RequestOpenGameJoinRequest
  | CancelOpenGameJoinRequest
  | ConfirmOpenGameJoinRequest
  | RejectOpenGameJoinRequest
  | SetReadyRequest
  | StartGameRequest
  | RematchRequest;

export type OpenGameStatus = 'free' | 'joining' | 'confirmed';

export interface OpenGameListItem {
  sessionId: SessionId;
  mode: 'online';
  hostName: string;
  guestName?: string;
  cols: number;
  rows: number;
  paletteSize: number;
  status: OpenGameStatus;
  createdAt: string;
}

export interface GameCreatedEvent {
  type: 'game_created';
  payload: {
    sessionId: SessionId;
    state: GameState;
    hostName: string;
    guestName?: string;
  };
}

export interface StateDiffEvent {
  type: 'state_diff';
  payload: {
    sessionId: SessionId;
    diff: GameDiff;
  };
}

export interface GameOverEvent {
  type: 'game_over';
  payload: {
    sessionId: SessionId;
    winner: GameWinner;
    turn: number;
  };
}

export interface GameJoinedEvent {
  type: 'game_joined';
  payload: {
    sessionId: SessionId;
    state: GameState;
    hostName: string;
    guestName?: string;
  };
}

export interface LobbyStateEvent {
  type: 'lobby_state';
  payload: {
    sessionId: SessionId;
    hostConnected: boolean;
    guestConnected: boolean;
    canStart: boolean;
    started: boolean;
    published: boolean;
    openGameStatus?: OpenGameStatus;
    hostName: string;
    guestName?: string;
  };
}

export interface OpenGamesSnapshotEvent {
  type: 'open_games_snapshot';
  payload: {
    games: OpenGameListItem[];
  };
}

export interface GameStartedEvent {
  type: 'game_started';
  payload: {
    sessionId: SessionId;
    turn: number;
    hostName: string;
    guestName?: string;
  };
}

export interface RematchStartedEvent {
  type: 'rematch_started';
  payload: {
    sessionId: SessionId;
    state: GameState;
    hostName: string;
    guestName?: string;
  };
}

export interface ErrorEvent {
  type: 'error';
  payload: {
    code: string;
    message: string;
  };
}

export type ServerEvent =
  | GameCreatedEvent
  | StateDiffEvent
  | GameOverEvent
  | GameJoinedEvent
  | LobbyStateEvent
  | OpenGamesSnapshotEvent
  | GameStartedEvent
  | RematchStartedEvent
  | ErrorEvent;

export const BINARY_FRAME_STATE_DIFF = 1;
export const BINARY_FRAME_GAME_OVER = 2;

export function encodeGameDiffBinary(diff: GameDiff): ArrayBuffer {
  const count = diff.changedCells.length;
  const byteLength = 4 + 1 + 4 + count * (4 + 1 + 1);
  const view = new DataView(new ArrayBuffer(byteLength));
  let offset = 0;

  view.setUint32(offset, diff.turn, true);
  offset += 4;
  view.setUint8(offset, diff.nextTurn);
  offset += 1;
  view.setUint32(offset, count, true);
  offset += 4;

  for (let i = 0; i < count; i += 1) {
    view.setUint32(offset, diff.changedCells[i], true);
    offset += 4;
    view.setUint8(offset, diff.owner[i]);
    offset += 1;
    view.setUint8(offset, diff.color[i]);
    offset += 1;
  }

  return view.buffer;
}

export function decodeGameDiffBinary(buffer: ArrayBuffer): GameDiff {
  const view = new DataView(buffer);
  let offset = 0;
  const turn = view.getUint32(offset, true);
  offset += 4;
  const nextTurn = view.getUint8(offset) as PlayerId;
  offset += 1;
  const count = view.getUint32(offset, true);
  offset += 4;

  const changedCells = new Uint32Array(count);
  const owner = new Uint8Array(count);
  const color = new Uint8Array(count);

  for (let i = 0; i < count; i += 1) {
    changedCells[i] = view.getUint32(offset, true);
    offset += 4;
    owner[i] = view.getUint8(offset);
    offset += 1;
    color[i] = view.getUint8(offset);
    offset += 1;
  }

  return {
    changedCells,
    owner,
    color,
    nextTurn,
    turn
  };
}

export function encodeStateDiffFrame(sessionId: SessionId, diff: GameDiff): ArrayBuffer {
  const encoder = new TextEncoder();
  const sessionBytes = encoder.encode(sessionId);
  const diffPayload = encodeGameDiffBinary(diff);
  const out = new Uint8Array(1 + 2 + sessionBytes.length + diffPayload.byteLength);

  let offset = 0;
  out[offset] = BINARY_FRAME_STATE_DIFF;
  offset += 1;

  const sessionLenView = new DataView(out.buffer, offset, 2);
  sessionLenView.setUint16(0, sessionBytes.length, true);
  offset += 2;

  out.set(sessionBytes, offset);
  offset += sessionBytes.length;
  out.set(new Uint8Array(diffPayload), offset);

  return out.buffer;
}

export function decodeStateDiffFrame(buffer: ArrayBuffer): { sessionId: SessionId; diff: GameDiff } {
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  const frameType = bytes[offset];
  offset += 1;
  if (frameType !== BINARY_FRAME_STATE_DIFF) {
    throw new Error('Unexpected frame type for state diff');
  }

  const lenView = new DataView(buffer, offset, 2);
  const sessionLength = lenView.getUint16(0, true);
  offset += 2;

  const sessionBytes = bytes.subarray(offset, offset + sessionLength);
  offset += sessionLength;

  const decoder = new TextDecoder();
  const sessionId = decoder.decode(sessionBytes);
  const diff = decodeGameDiffBinary(buffer.slice(offset));
  return { sessionId, diff };
}

export function encodeGameOverFrame(
  sessionId: SessionId,
  payload: { winner: GameWinner; turn: number }
): ArrayBuffer {
  const encoder = new TextEncoder();
  const sessionBytes = encoder.encode(sessionId);
  const out = new Uint8Array(1 + 2 + sessionBytes.length + 1 + 2 + 2 + 4);
  let offset = 0;

  out[offset] = BINARY_FRAME_GAME_OVER;
  offset += 1;

  const lenView = new DataView(out.buffer, offset, 2);
  lenView.setUint16(0, sessionBytes.length, true);
  offset += 2;

  out.set(sessionBytes, offset);
  offset += sessionBytes.length;

  out[offset] = payload.winner.winner;
  offset += 1;

  const scoresView = new DataView(out.buffer, offset, 4);
  scoresView.setUint16(0, payload.winner.score1, true);
  scoresView.setUint16(2, payload.winner.score2, true);
  offset += 4;

  const turnView = new DataView(out.buffer, offset, 4);
  turnView.setUint32(0, payload.turn, true);

  return out.buffer;
}

function decodeGameOverFrameUnsafe(
  buffer: ArrayBuffer
): { sessionId: SessionId; winner: GameWinner; turn: number } {
  const bytes = new Uint8Array(buffer);
  let offset = 1;

  const lenView = new DataView(buffer, offset, 2);
  const sessionLength = lenView.getUint16(0, true);
  offset += 2;

  const sessionBytes = bytes.subarray(offset, offset + sessionLength);
  offset += sessionLength;

  const decoder = new TextDecoder();
  const sessionId = decoder.decode(sessionBytes);
  const winnerId = bytes[offset] as GameWinner['winner'];
  offset += 1;

  const scoresView = new DataView(buffer, offset, 4);
  const score1 = scoresView.getUint16(0, true);
  const score2 = scoresView.getUint16(2, true);
  offset += 4;

  const turnView = new DataView(buffer, offset, 4);
  const turn = turnView.getUint32(0, true);

  return {
    sessionId,
    winner: {
      winner: winnerId,
      score1,
      score2
    },
    turn
  };
}

export function decodeServerBinaryFrame(
  buffer: ArrayBuffer
):
  | { type: 'state_diff'; sessionId: SessionId; diff: GameDiff }
  | { type: 'game_over'; sessionId: SessionId; winner: GameWinner; turn: number } {
  const bytes = new Uint8Array(buffer);
  const frameType = bytes[0];

  if (frameType === BINARY_FRAME_STATE_DIFF) {
    const payload = decodeStateDiffFrame(buffer);
    return { type: 'state_diff', ...payload };
  }

  if (frameType === BINARY_FRAME_GAME_OVER) {
    const payload = decodeGameOverFrameUnsafe(buffer);
    return { type: 'game_over', ...payload };
  }

  throw new Error('Unsupported binary frame type');
}
