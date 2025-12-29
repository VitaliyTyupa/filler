import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { GameGrid } from './game-grid';
import { ColorPickerComponent } from './color-picker/color-picker.component';
import { DEFAULT_PALETTE, GameService, GameState, PlayerId } from './game.service';

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
  private readonly gridConfig = { cols: 25, rows: 20 };

  users: Array<{ id: number; name: string }> = [];
  palette: string[] = [];
  state?: GameState;
  validMovesByUser: Record<number, boolean[]> = {};

  constructor(private readonly gameService: GameService) {}

  ngOnInit(): void {
    this.users = this.gameService.getUsers();
    this.palette = this.gameService.getPalette();

    this.state = this.gameService.generateInitialState({
      cols: this.gridConfig.cols,
      rows: this.gridConfig.rows,
      paletteSize: this.palette.length || DEFAULT_PALETTE.length
    });

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
      palette: this.palette.length ? this.palette : DEFAULT_PALETTE
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
    if (!this.state) {
      return;
    }

    this.state = this.gameService.applyMove(this.state, event.userId as PlayerId, event.colorIndex);
    this.updateValidMoves();

    console.log('current player', this.state.currentPlayer, 'score', this.state.score);

    if (this.grid) {
      this.grid.setGridData({ owner: this.state.owner, color: this.state.color });
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
}
