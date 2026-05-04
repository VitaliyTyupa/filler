import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { applyMove, createInitialState, getWinner, isGameOver, pickCpuMove } from '@game-core';
import { CreateGameRequest, SessionId } from '@shared';
import { GameState, GameWinner, MoveInput } from '@game-core';

export interface MoveResult {
  sessionId: SessionId;
  state: GameState;
  diffs: NonNullable<ReturnType<typeof applyMove>['diff']>[];
  gameOver: boolean;
  winner?: GameWinner;
}

@Injectable()
export class SessionManager {
  private readonly sessions = new Map<SessionId, GameState>();

  createGame(payload: CreateGameRequest['payload']): { sessionId: SessionId; state: GameState } {
    const sessionId = randomUUID();
    const state = createInitialState(payload);
    this.sessions.set(sessionId, state);
    return { sessionId, state };
  }

  getState(sessionId: SessionId): GameState | undefined {
    return this.sessions.get(sessionId);
  }

  handleMove(sessionId: SessionId, move: MoveInput): MoveResult | null {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return null;
    }

    const moveResult = applyMove(state, move);
    if (!moveResult.diff) {
      return {
        sessionId,
        state,
        diffs: [],
        gameOver: isGameOver(state),
        winner: isGameOver(state) ? getWinner(state) : undefined
      };
    }

    let nextState = moveResult.state;
    const diffs: NonNullable<ReturnType<typeof applyMove>['diff']>[] = [moveResult.diff];
    this.sessions.set(sessionId, nextState);

    if (isGameOver(nextState)) {
      return {
        sessionId,
        state: nextState,
        diffs,
        gameOver: true,
        winner: getWinner(nextState)
      };
    }

    if (nextState.cpuPlayerId && nextState.currentPlayer === nextState.cpuPlayerId) {
      const cpuMove = pickCpuMove(nextState);
      const cpuResult = applyMove(nextState, {
        playerId: nextState.cpuPlayerId,
        colorIndex: cpuMove,
        expectedTurn: nextState.turn
      });

      if (cpuResult.diff) {
        nextState = cpuResult.state;
        diffs.push(cpuResult.diff);
        this.sessions.set(sessionId, nextState);
      }
    }

    return {
      sessionId,
      state: nextState,
      diffs,
      gameOver: isGameOver(nextState),
      winner: isGameOver(nextState) ? getWinner(nextState) : undefined
    };
  }
}
