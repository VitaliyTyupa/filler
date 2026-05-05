import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { DEFAULT_PALETTE_10, getPalette } from '../../game.constants';
import { GameSessionService, GameSettings } from '../../game-session.service';
import { ColorPickerComponent } from './color-picker/color-picker.component';
import { GameGrid } from './game-grid';
import { GameDiff, GameState, PlayerId } from '@game-core';
import { GameRealtimeService, RealtimeCreateGameResult } from '../../game/realtime/game-realtime.service';
import { Subscription } from 'rxjs';
import { GameSessionFacade } from '../../game/game-session.facade';
import { SessionUiStore } from '../../game/session-ui.store';

@Component({
  selector: 'fil-game-page',
  standalone: true,
  imports: [
    ColorPickerComponent
  ],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.scss'
})
export class GamePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('boardContainer', { static: true })
  private boardContainer?: ElementRef<HTMLDivElement>;

  @ViewChild('boardCanvas', { static: true })
  private boardCanvas?: ElementRef<HTMLCanvasElement>;

  private grid?: GameGrid;
  private settings?: GameSettings;
  private sessionId?: string;
  private viewReady = false;
  private remoteMoveSubscription?: Subscription;

  palette: string[] = [];
  state?: GameState;
  isCpuMode = false;
  cpuPlayerId?: PlayerId;
  localOnlinePlayerId?: PlayerId;

  constructor(
    private readonly realtimeService: GameRealtimeService,
    private readonly sessionFacade: GameSessionFacade,
    readonly sessionUiStore: SessionUiStore,
    private readonly gameSession: GameSessionService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    if (!this.gameSession.hasSettings()) {
      this.router.navigateByUrl('/start');
      return;
    }

    this.settings = this.gameSession.getSettings()!;

    const { board, paletteSize, players, mode } = this.settings;

    this.isCpuMode = mode === 'cpu';
    this.cpuPlayerId = players.find((player) => player.isCpu)?.id as PlayerId | undefined;

    this.palette = getPalette(paletteSize);

    if (mode === 'online') {
      this.remoteMoveSubscription = this.realtimeService.remoteMove$.subscribe((event) => {
        if (!this.sessionId || event.sessionId !== this.sessionId) {
          return;
        }

        for (const diff of event.diffs) {
          this.applyGridDiff(diff);
        }

        this.state = event.state;

        if (event.gameOver && event.winner) {
          this.gameSession.setResult(event.winner);
          void this.router.navigateByUrl('/final');
        }
      });
    }

    void this.startSession();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.tryInitGrid();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.handleResize);
    this.grid?.dispose();
    this.remoteMoveSubscription?.unsubscribe();
  }

  private async startSession(): Promise<void> {
    if (!this.settings) {
      return;
    }

    try {
      let created: RealtimeCreateGameResult | null;

      if (this.settings.mode === 'online') {
        const existing = this.gameSession.getRealtimeSession();
        if (!existing) {
          this.router.navigateByUrl('/waiting');
          return;
        }
        if (!existing.started) {
          this.router.navigateByUrl('/waiting');
          return;
        }
        if (existing.role !== 'host' && existing.role !== 'guest') {
          this.router.navigateByUrl('/waiting');
          return;
        }
        this.localOnlinePlayerId = existing.role === 'guest' ? 2 : 1;
        const cached = this.realtimeService.getState(existing.sessionId);
        if (cached) {
          created = {
            sessionId: existing.sessionId,
            state: cached,
            hostName: existing.hostName ?? $localize`:@@playerFallbackName:Гравець ${1}:playerId:`,
            guestName: existing.guestName
          };
        } else {
          created = await this.realtimeService.joinGame(
            existing.sessionId,
            this.settings.players.find((player) => player.id === 1)?.name
          );
          if (created) {
            this.gameSession.setRealtimeSession({
              ...existing,
              sessionId: created.sessionId,
              hostName: created.hostName,
              guestName: created.guestName,
              startedAt: existing.startedAt ?? new Date().toISOString()
            });
          }
        }
      } else {
        created = await this.realtimeService.createGame({
          cols: this.settings.board.cols,
          rows: this.settings.board.rows,
          paletteSize: this.palette.length,
          seed: Date.now() >>> 0,
          mode: this.settings.mode,
          cpuPlayerId: this.cpuPlayerId,
          cpuDifficulty: this.settings.cpuDifficulty
        });
        this.gameSession.setRealtimeSession({
          sessionId: created.sessionId,
          startedAt: new Date().toISOString()
        });
      }

      if (!created) {
        this.router.navigateByUrl('/waiting');
        return;
      }

      if (this.settings.mode === 'online') {
        this.applyAuthoritativeOnlineSettings(created.state, created.hostName, created.guestName);
        const currentSession = this.gameSession.getRealtimeSession();
        if (currentSession && !currentSession.startedAt) {
          this.gameSession.setRealtimeSession({
            ...currentSession,
            startedAt: new Date().toISOString()
          });
        }
      }

      this.sessionId = created.sessionId;
      this.state = created.state;
      const playerNames = this.resolvePlayerNames(created.hostName, created.guestName);
      this.sessionFacade.initializeUiSession({
        sessionId: created.sessionId,
        settings: this.settings,
        palette: this.palette,
        state: created.state,
        ownPlayerId: this.localOnlinePlayerId ?? null,
        playerNames
      });
      this.sessionFacade.setPlayerNames(
        created.sessionId,
        playerNames ?? {
          1: this.settings.players.find((player) => player.id === 1)?.name ?? created.hostName,
          2: this.settings.players.find((player) => player.id === 2)?.name
            ?? created.guestName
            ?? $localize`:@@playerFallbackName:Гравець ${2}:playerId:`
        }
      );
      this.tryInitGrid();
    } catch {
      if (this.sessionId) {
        this.sessionFacade.markInterrupted(this.sessionId);
      }
      this.router.navigateByUrl('/waiting');
    }
  }

  private handleResize = (): void => {
    if (!this.boardContainer || !this.grid) {
      return;
    }

    const { clientWidth, clientHeight } = this.boardContainer.nativeElement;
    this.grid.updateLayout(clientWidth, clientHeight);
  };

  async onColorPick(event: { userId: number; colorIndex: number; colorHex: string }): Promise<void> {
    if (!this.state || !this.sessionId || this.sessionUiStore.state().busy) {
      return;
    }

    if (this.settings?.mode === 'online') {
      const ownId = this.localOnlinePlayerId;
      if (!ownId || event.userId !== ownId || this.state.currentPlayer !== ownId) {
        return;
      }
    }

    try {
      const result = await this.sessionFacade.submitMove(this.sessionId, {
        playerId: event.userId as PlayerId,
        colorIndex: event.colorIndex,
        expectedTurn: this.state.turn
      });

      if (!result || !result.diffs.length) {
        return;
      }

      for (const diff of result.diffs) {
        this.applyGridDiff(diff);
      }

      this.state = result.state;

      if (result.gameOver && result.winner) {
        this.gameSession.setResult(result.winner);
        this.router.navigateByUrl('/final');
      }
    } catch {
      this.sessionFacade.markInterrupted(this.sessionId);
    }
  }

  get playerOneStartHint(): string {
    return $localize`:@@gamePlayerOneStartHint:Гравець 1 ${this.getPlayerName(1)}:playerName: починає гру тут`;
  }

  get playerTwoStartHint(): string {
    return $localize`:@@gamePlayerTwoStartHint:Гравець 2 ${this.getPlayerName(2)}:playerName: починає гру тут`;
  }

  private applyGridDiff(diff: GameDiff): void {
    if (!this.grid || !this.state) {
      return;
    }

    const animFromColor = new Uint8Array(diff.changedCells.length);
    const animToColor = new Uint8Array(diff.changedCells.length);
    const animDelay01 = new Float32Array(diff.changedCells.length);
    const animMoveId = new Uint32Array(diff.changedCells.length);
    const maxDistance = Math.max(1, (this.state.cols - 1) + (this.state.rows - 1));

    for (let i = 0; i < diff.changedCells.length; i += 1) {
      const cellIndex = diff.changedCells[i];
      const row = Math.floor(cellIndex / this.state.cols);
      const col = cellIndex - row * this.state.cols;
      animFromColor[i] = this.state.color[cellIndex];
      animToColor[i] = diff.color[i];
      animDelay01[i] = (row + col) / maxDistance;
      animMoveId[i] = diff.turn;
    }

    this.grid.applyDiff({
      indices: diff.changedCells,
      owner: diff.owner,
      color: diff.color,
      animFromColor,
      animToColor,
      animDelay01,
      animMoveId
    });
  }

  private getPlayerName(playerId: 1 | 2): string {
    const fallbackName = $localize`:@@playerFallbackName:Гравець ${playerId}:playerId:`;
    return this.settings?.players.find((player) => player.id === playerId)?.name ?? fallbackName;
  }

  private tryInitGrid(): void {
    if (!this.viewReady || !this.boardContainer || !this.boardCanvas || !this.state || this.grid) {
      return;
    }

    const { clientWidth, clientHeight } = this.boardContainer.nativeElement;
    this.grid = new GameGrid({
      canvas: this.boardCanvas.nativeElement,
      width: clientWidth,
      height: clientHeight,
      grid: { cols: this.state.cols, rows: this.state.rows, colors: this.state.color },
      palette: this.palette.length ? this.palette : DEFAULT_PALETTE_10
    });

    this.grid.init();
    this.grid.setGridData({ owner: this.state.owner, color: this.state.color });
    this.grid.start();
    window.addEventListener('resize', this.handleResize);
  }

  private applyAuthoritativeOnlineSettings(state: GameState, hostName?: string, guestName?: string): void {
    if (!this.settings || this.settings.mode !== 'online') {
      return;
    }

    const session = this.gameSession.getRealtimeSession();
    const hostFallback = this.settings.players.find((player) => player.id === 1)?.name ?? $localize`:@@playerFallbackName:Гравець ${1}:playerId:`;
    const guestFallback = session?.role === 'guest'
      ? this.settings.players.find((player) => player.id === 2)?.name
        ?? this.settings.players.find((player) => player.id === 1)?.name
        ?? $localize`:@@playerFallbackName:Гравець ${2}:playerId:`
      : this.settings.players.find((player) => player.id === 2)?.name ?? $localize`:@@playerFallbackName:Гравець ${2}:playerId:`;

    this.settings = {
      ...this.settings,
      board: {
        cols: state.cols,
        rows: state.rows
      },
      paletteSize: this.normalizePaletteSize(state.paletteSize),
      players: [
        {
          id: 1,
          name: hostName?.trim() || session?.hostName || hostFallback
        },
        {
          id: 2,
          name: guestName?.trim() || session?.guestName || guestFallback
        }
      ]
    };

    this.gameSession.setSettings(this.settings);
    this.palette = getPalette(this.settings.paletteSize);
  }

  private resolvePlayerNames(hostName?: string, guestName?: string): Record<PlayerId, string> | undefined {
    if (this.settings?.mode !== 'online') {
      return undefined;
    }

    const session = this.gameSession.getRealtimeSession();
    const role = session?.role;
    const playerOneFallback = $localize`:@@playerFallbackName:Гравець ${1}:playerId:`;
    const playerTwoFallback = $localize`:@@playerFallbackName:Гравець ${2}:playerId:`;
    const localName = role === 'guest'
      ? this.settings.players.find((player) => player.id === 2)?.name
        ?? session?.guestName
        ?? playerTwoFallback
      : this.settings.players.find((player) => player.id === 1)?.name
        ?? session?.hostName
        ?? playerOneFallback;
    const resolvedHostName = hostName && hostName !== playerOneFallback
      ? hostName
      : session?.hostName && session.hostName !== playerOneFallback
        ? session.hostName
      : role === 'host'
        ? localName
        : playerOneFallback;
    const resolvedGuestName = guestName && guestName !== playerTwoFallback
      ? guestName
      : session?.guestName && session.guestName !== playerTwoFallback
        ? session.guestName
      : role === 'guest'
        ? localName
        : playerTwoFallback;

    return {
      1: resolvedHostName,
      2: resolvedGuestName
    };
  }

  private normalizePaletteSize(size: number): 5 | 7 | 10 {
    if (size === 7 || size === 10) {
      return size;
    }
    return 5;
  }
}
