import { Injectable } from '@angular/core';
import { GameState, MoveInput, PlayerId } from '@game-core';
import { GameRealtimeService, RealtimeMoveResult } from './realtime/game-realtime.service';
import { SessionUiStore, UiGameStatus } from './session-ui.store';
import { GameSettings } from '../game-session.service';

interface InitializeUiSessionInput {
  sessionId: string;
  settings: GameSettings;
  palette: string[];
  state: GameState;
  ownPlayerId: PlayerId | null;
  playerNames?: Record<PlayerId, string>;
}

@Injectable({ providedIn: 'root' })
export class GameSessionFacade {
  constructor(
    private readonly realtimeService: GameRealtimeService,
    private readonly sessionUiStore: SessionUiStore
  ) {}

  initializeUiSession(input: InitializeUiSessionInput): void {
    this.sessionUiStore.initializeSession({
      sessionId: input.sessionId,
      mode: input.settings.mode,
      palette: input.palette,
      state: input.state,
      ownPlayerId: this.resolveOwnPlayerId(input.settings, input.state, input.ownPlayerId),
      playerNames: input.playerNames ?? {
        1: input.settings.players.find((player) => player.id === 1)?.name ?? $localize`:@@playerFallbackName:Гравець ${1}:playerId:`,
        2: input.settings.players.find((player) => player.id === 2)?.name ?? $localize`:@@playerFallbackName:Гравець ${2}:playerId:`
      }
    });
  }

  syncUiState(sessionId: string, state: GameState, status: UiGameStatus = 'playing'): void {
    this.sessionUiStore.syncGameState({
      sessionId,
      state,
      status
    });
  }

  setPlayerNames(sessionId: string, playerNames: Record<PlayerId, string>): void {
    this.sessionUiStore.setPlayerNames(sessionId, playerNames);
  }

  async submitMove(sessionId: string, move: MoveInput): Promise<RealtimeMoveResult | null> {
    this.sessionUiStore.setBusy(sessionId, true);

    try {
      const result = await this.realtimeService.submitMove(sessionId, move);
      if (result) {
        this.syncUiState(sessionId, result.state, result.gameOver ? 'finished' : 'playing');
      }
      return result;
    } catch (error) {
      this.sessionUiStore.markInterrupted(sessionId);
      throw error;
    } finally {
      this.sessionUiStore.setBusy(sessionId, false);
    }
  }

  markInterrupted(sessionId: string): void {
    this.sessionUiStore.markInterrupted(sessionId);
  }

  private resolveOwnPlayerId(settings: GameSettings, state: GameState, ownPlayerId: PlayerId | null): PlayerId | null {
    if (settings.mode === 'online') {
      return ownPlayerId;
    }

    if (settings.mode === 'cpu') {
      return settings.players.find((player) => !player.isCpu)?.id ?? ownPlayerId;
    }

    return state.currentPlayer;
  }
}
