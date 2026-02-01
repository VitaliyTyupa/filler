import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { DEFAULT_PALETTE_10, getPalette } from '../../game.constants';
import { GameSessionService, GameSettings } from '../../game-session.service';
import { ColorPickerComponent } from './color-picker/color-picker.component';
import { GameGrid } from './game-grid';
import { GameService, GameState, PlayerId } from './game.service';

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

  users: Array<{ id: number; name: string; currentScore: number; isCpu: boolean }> = [];
  palette: string[] = [];
  state?: GameState;
  validMovesByUser: Record<number, boolean[]> = {};
  isCpuMode = false;
  cpuPlayerId?: PlayerId;
  isBusy = false;

  constructor(
    private readonly gameService: GameService,
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

    this.baseUsers = players.map((player) => ({
      id: player.id,
      name: player.name,
      isCpu: player.isCpu ?? false
    }));

    this.state = this.gameService.generateInitialState({
      cols: board.cols,
      rows: board.rows,
      paletteSize: this.palette.length,
      cpuPlayerId: this.cpuPlayerId,
      cpuDifficulty: this.settings.cpuDifficulty
    });

    this.updateUsersWithScore();
    this.updateValidMoves();
  }

  ngAfterViewInit(): void {
    if (!this.boardContainer || !this.boardCanvas || !this.state) {
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

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.handleResize);
    this.grid?.dispose();
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

        const cpuColor = this.gameService.pickCpuMove();
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

    this.users.forEach((user) => {
      mapping[user.id] = this.gameService.getValidMoves(this.state as GameState, user.id as PlayerId);
    });

    this.validMovesByUser = mapping;
  }

  private updateUsersWithScore(): void {
    if (!this.state) {
      return;
    }

    this.users = this.baseUsers.map((user) => ({
      ...user,
      currentScore: this.state?.score?.[user.id] ?? 0
    }));
  }

  private applyMoveAndUpdate(playerId: PlayerId, colorIndex: number): void {
    if (!this.state) {
      return;
    }

    const result = this.gameService.applyMove(this.state, playerId, colorIndex);
    this.state = result.state;
    this.updateUsersWithScore();
    this.updateValidMoves();

    console.log('scores', this.state.score[1], this.state.score[2]);

    if (this.grid) {
      if (result.diffs.length) {
        result.diffs.forEach((diff) => this.grid?.applyDiff(diff));
      } else {
        this.grid.setGridData({ owner: this.state.owner, color: this.state.color });
      }
    }
  }

  private afterMoveCheck(): boolean {
    if (!this.state) {
      return false;
    }

    if (this.gameService.isGameOver(this.state)) {
      const result = this.gameService.getWinner(this.state);
      this.gameSession.setResult(result);
      this.router.navigateByUrl('/final');
      return true;
    }

    return false;
  }
}
