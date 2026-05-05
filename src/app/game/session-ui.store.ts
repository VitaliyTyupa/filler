import { computed, Injectable, signal } from '@angular/core';
import { GameState, getValidMoves, PlayerId } from '@game-core';
import { GameMode } from '../game-session.service';

export type UiGameStatus = 'playing' | 'finished' | 'interrupted';
export type UiPlayerStatus = 'connected' | 'disconnected';

export interface UiPlayerViewState {
  id: PlayerId;
  name: string;
  isSelf: boolean;
  score: number;
  moveCount: number;
  lastMoveNumber: number | null;
  lastColorIndex: number | null;
  status: UiPlayerStatus;
}

export interface UiPaletteOption {
  index: number;
  hex: string;
  disabled: boolean;
}

export interface UiSessionViewState {
  sessionId: string | null;
  mode: GameMode | null;
  status: UiGameStatus;
  ownPlayerId: PlayerId | null;
  activePlayerId: PlayerId | null;
  busy: boolean;
  palette: string[];
  selectableColors: boolean[];
  players: UiPlayerViewState[];
}

interface InitializeSessionInput {
  sessionId: string;
  mode: GameMode;
  palette: string[];
  state: GameState;
  ownPlayerId: PlayerId | null;
  playerNames: Record<PlayerId, string>;
}

interface SyncGameStateInput {
  sessionId: string;
  state: GameState;
  status?: UiGameStatus;
  playerNames?: Record<PlayerId, string>;
}

const EMPTY_UI_STATE: UiSessionViewState = {
  sessionId: null,
  mode: null,
  status: 'playing',
  ownPlayerId: null,
  activePlayerId: null,
  busy: false,
  palette: [],
  selectableColors: [],
  players: []
};

@Injectable({ providedIn: 'root' })
export class SessionUiStore {
  private readonly stateSignal = signal<UiSessionViewState>(EMPTY_UI_STATE);

  readonly state = this.stateSignal.asReadonly();
  readonly selfPlayer = computed(() => this.state().players.find((player) => player.isSelf) ?? null);
  readonly opponentPlayer = computed(() => this.state().players.find((player) => !player.isSelf) ?? null);
  readonly paletteOptions = computed<UiPaletteOption[]>(() => {
    const state = this.state();
    const self = this.selfPlayer();
    if (!self) {
      return [];
    }

    return state.palette.map((hex, index) => ({
      index,
      hex,
      disabled: state.busy || state.status !== 'playing' || state.activePlayerId !== self.id || !state.selectableColors[index]
    }));
  });

  initializeSession(input: InitializeSessionInput): void {
    this.stateSignal.set(
      this.buildState({
        sessionId: input.sessionId,
        mode: input.mode,
        palette: input.palette,
        state: input.state,
        ownPlayerId: input.ownPlayerId,
        playerNames: input.playerNames,
        busy: false,
        status: 'playing'
      })
    );
  }

  syncGameState(input: SyncGameStateInput): void {
    const current = this.stateSignal();
    if (current.sessionId !== input.sessionId || current.mode === null) {
      return;
    }

    this.stateSignal.set(
      this.buildState({
        sessionId: input.sessionId,
        mode: current.mode,
        palette: current.palette,
        state: input.state,
        ownPlayerId: current.ownPlayerId,
        playerNames: input.playerNames ?? this.toPlayerNames(current.players),
        busy: current.busy,
        status: input.status ?? current.status
      })
    );
  }

  setBusy(sessionId: string, busy: boolean): void {
    const current = this.stateSignal();
    if (current.sessionId !== sessionId) {
      return;
    }

    this.stateSignal.update((state) => ({
      ...state,
      busy
    }));
  }

  markInterrupted(sessionId: string): void {
    const current = this.stateSignal();
    if (current.sessionId !== sessionId || current.status === 'finished') {
      return;
    }

    this.stateSignal.update((state) => ({
      ...state,
      busy: false,
      status: 'interrupted',
      players: state.players.map((player) => ({
        ...player,
        status: 'disconnected'
      }))
    }));
  }

  reset(): void {
    this.stateSignal.set(EMPTY_UI_STATE);
  }

  setPlayerNames(sessionId: string, playerNames: Record<PlayerId, string>): void {
    const current = this.stateSignal();
    if (current.sessionId !== sessionId || current.mode === null) {
      return;
    }

    this.stateSignal.update((state) => ({
      ...state,
      players: state.players.map((player) => ({
        ...player,
        name: playerNames[player.id]
      }))
    }));
  }

  private buildState(input: InitializeSessionInput & { busy: boolean; status: UiGameStatus }): UiSessionViewState {
    const ownPlayerId = input.mode === 'local' ? input.state.currentPlayer : input.ownPlayerId;
    const players: UiPlayerViewState[] = [1, 2].map((playerId) => ({
      id: playerId as PlayerId,
      name: input.playerNames[playerId as PlayerId],
      isSelf: ownPlayerId === playerId,
      score: input.state.score[playerId],
      moveCount: playerId === 1 ? Math.ceil(input.state.turn / 2) : Math.floor(input.state.turn / 2),
      lastMoveNumber: this.getLastMoveNumber(input.state.turn, playerId as PlayerId),
      lastColorIndex: input.state.playerColor[playerId] ?? null,
      status: input.status === 'interrupted' ? 'disconnected' : 'connected'
    }));

    return {
      sessionId: input.sessionId,
      mode: input.mode,
      status: input.status,
      ownPlayerId,
      activePlayerId: input.state.currentPlayer,
      busy: input.busy,
      palette: input.palette,
      selectableColors: ownPlayerId && input.status === 'playing' && input.state.currentPlayer === ownPlayerId
        ? getValidMoves(input.state, ownPlayerId)
        : new Array<boolean>(input.palette.length).fill(false),
      players
    };
  }

  private getLastMoveNumber(turn: number, playerId: PlayerId): number | null {
    const moveCount = playerId === 1 ? Math.ceil(turn / 2) : Math.floor(turn / 2);
    if (moveCount === 0) {
      return null;
    }

    return playerId === 1 ? moveCount * 2 - 1 : moveCount * 2;
  }

  private toPlayerNames(players: UiPlayerViewState[]): Record<PlayerId, string> {
    const playerOne = players.find((player) => player.id === 1)?.name ?? $localize`:@@playerFallbackName:Гравець ${1}:playerId:`;
    const playerTwo = players.find((player) => player.id === 2)?.name ?? $localize`:@@playerFallbackName:Гравець ${2}:playerId:`;
    return {
      1: playerOne,
      2: playerTwo
    };
  }
}
