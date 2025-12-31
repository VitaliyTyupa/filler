import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DEFAULT_PALETTE_10, getPalette } from '../../game.constants';
import { GameSessionService, GameSettings } from '../../game-session.service';
import { ColorPickerComponent } from './color-picker/color-picker.component';
import { GameGrid } from './game-grid';
import { GameService, GameState, PlayerId } from './game.service';
import { OnlineGameService } from '../../online-game.service';

interface SerializedGameState {
  cols: number;
  rows: number;
  paletteSize: number;
  owner: number[];
  color: number[];
  playerColor: number[];
  currentPlayer: 1 | 2;
  score: number[];
}

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
  private baseUsers: Array<{ id: number; name: string; isCpu: boolean }> = [];
  private onlineSubscriptions: Subscription[] = [];

  users: Array<{ id: number; name: string; currentScore: number; isCpu: boolean }> = [];
  palette: string[] = [];
  state?: GameState | SerializedGameState;
  validMovesByUser: Record<number, boolean[]> = {};
  isCpuMode = false;
  cpuPlayerId?: PlayerId;
  isBusy = false;

  constructor(
    private readonly gameService: GameService,
    private readonly gameSession: GameSessionService,
    private readonly onlineGame: OnlineGameService,
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

    this.baseUsers = players.map((player) => ({
      id: player.id,
      name: player.name,
      isCpu: player.isCpu ?? false
    }));

    this.validMovesByUser = this.baseUsers.reduce((mapping, user) => {
      return { ...mapping, [user.id]: new Array(this.palette.length).fill(false) };
    }, {} as Record<number, boolean[]>);

    if (mode === 'online') {
      const roomId = this.gameSession.getRoomId();
      const assignedPlayerId = this.gameSession.getAssignedPlayerId();

      if (!roomId || !assignedPlayerId) {
        this.router.navigateByUrl('/waiting');
        return;
      }

      this.onlineGame.connect();
      this.setupOnlineSubscriptions();
      this.updateUsersWithScore();
      return;
    }

    this.state = this.gameService.generateInitialState({
      cols: board.cols,
      rows: board.rows,
      paletteSize: this.palette.length
    });

    this.updateUsersWithScore();
    this.updateValidMoves();
  }

  ngAfterViewInit(): void {
    this.tryInitializeGrid();
    window.addEventListener('resize', this.handleResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.handleResize);
    this.grid?.dispose();
    this.onlineSubscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  private handleResize = (): void => {
    if (!this.boardContainer || !this.grid) {
      return;
    }

    const { clientWidth, clientHeight } = this.boardContainer.nativeElement;
    this.grid.updateLayout(clientWidth, clientHeight);
  };

  onColorPick(event: { userId: number; colorIndex: number; colorHex: string }): void {
    if (!this.state || this.isBusy) {
      return;
    }

    if (this.settings?.mode === 'online') {
      if (event.userId !== this.gameSession.getAssignedPlayerId()) {
        return;
      }

      if (event.userId !== this.state.currentPlayer) {
        return;
      }

      this.onlineGame.pickColor({ roomId: this.gameSession.getRoomId()!, colorIndex: event.colorIndex });
      return;
    }

    this.applyMoveAndUpdate(event.userId as PlayerId, event.colorIndex);

    if (this.afterMoveCheck()) {
      this.isBusy = false;
      return;
    }

    if (this.isCpuMode && this.state.currentPlayer === this.cpuPlayerId && this.cpuPlayerId) {
      this.isBusy = true;
      setTimeout(() => {
        if (!this.state || !this.cpuPlayerId) {
          this.isBusy = false;
          return;
        }

        const cpuColor = this.gameService.pickCpuMove(this.state, this.cpuPlayerId);
        this.applyMoveAndUpdate(this.cpuPlayerId, cpuColor);

        if (this.afterMoveCheck()) {
          this.isBusy = false;
          return;
        }

        this.isBusy = false;
      }, 1000);
    }
  }

  private updateValidMoves(): void {
    if (!this.state) {
      return;
    }

    const mapping: Record<number, boolean[]> = {};

    if (this.settings?.mode === 'online') {
      this.users.forEach((user) => {
        const isActive = user.id === this.state?.currentPlayer;
        mapping[user.id] = new Array(this.palette.length).fill(isActive);
      });
    } else {
      this.users.forEach((user) => {
        mapping[user.id] = this.gameService.getValidMoves(this.state as GameState, user.id as PlayerId);
      });
    }

    this.validMovesByUser = mapping;
  }

  private updateUsersWithScore(): void {
    this.users = this.baseUsers.map((user) => ({
      ...user,
      currentScore: this.state?.score?.[user.id] ?? 0
    }));
  }

  private applyMoveAndUpdate(playerId: PlayerId, colorIndex: number): void {
    if (!this.state || this.settings?.mode === 'online') {
      return;
    }

    this.state = this.gameService.applyMove(this.state, playerId, colorIndex);
    this.updateUsersWithScore();
    this.updateValidMoves();

    console.log('scores', this.state.score[1], this.state.score[2]);

    if (this.grid) {
      this.grid.setGridData({ owner: this.state.owner, color: this.state.color });
    }
  }

  private afterMoveCheck(): boolean {
    if (!this.state) {
      return false;
    }

    if (this.settings?.mode === 'online') {
      return false;
    }

    if (this.gameService.isGameOver(this.state as GameState)) {
      const result = this.gameService.getWinner(this.state);
      this.gameSession.setResult(result);
      this.router.navigateByUrl('/final');
      return true;
    }

    return false;
  }

  private setupOnlineSubscriptions(): void {
    const stateSub = this.onlineGame.gameState$.subscribe((payload) => {
      if (!payload?.state) {
        return;
      }

      this.state = payload.state as SerializedGameState;
      this.updateUsersWithScore();
      this.updateValidMoves();
      this.tryInitializeGrid();

      if (this.grid && this.state) {
        const owner = Uint8Array.from(this.state.owner);
        const color = Uint8Array.from(this.state.color);

        this.grid.setGridData({ owner, color });
      }
    });

    const overSub = this.onlineGame.gameOver$.subscribe((result) => {
      this.gameSession.setResult(result);
      this.router.navigateByUrl('/final');
    });

    const errorSub = this.onlineGame.error$.subscribe((error) => {
      console.error('[online] error', error);
    });

    this.onlineSubscriptions.push(stateSub, overSub, errorSub);
  }

  private tryInitializeGrid(): void {
    if (!this.boardContainer || !this.boardCanvas || !this.state) {
      return;
    }

    if (this.grid) {
      return;
    }

    const { clientWidth, clientHeight } = this.boardContainer.nativeElement;

    const gridColors = this.state.color instanceof Uint8Array ? this.state.color : Uint8Array.from(this.state.color);

    this.grid = new GameGrid({
      canvas: this.boardCanvas.nativeElement,
      width: clientWidth,
      height: clientHeight,
      grid: { cols: this.state.cols, rows: this.state.rows, colors: gridColors },
      palette: this.palette.length ? this.palette : DEFAULT_PALETTE_10
    });

    this.grid.init();

    const owner = this.state.owner instanceof Uint8Array ? this.state.owner : Uint8Array.from(this.state.owner);
    const color = this.state.color instanceof Uint8Array ? this.state.color : Uint8Array.from(this.state.color);

    this.grid.setGridData({ owner, color });
    this.grid.start();
  }
}
