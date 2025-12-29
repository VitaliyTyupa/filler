import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { GameGrid } from './game-grid';
import { ColorPickerComponent } from './color-picker/color-picker.component';
import { DEFAULT_PALETTE, GameService } from './game.service';

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
  private readonly gridConfig = { cols: 120, rows: 100 };

  users: Array<{ id: number; name: string }> = [];
  palette: string[] = [];

  constructor(private readonly gameService: GameService) {}

  ngOnInit(): void {
    this.users = this.gameService.getUsers();
    this.palette = this.gameService.getPalette();
  }

  ngAfterViewInit(): void {
    if (!this.boardContainer || !this.boardCanvas) {
      return;
    }

    const { clientWidth, clientHeight } = this.boardContainer.nativeElement;
    const paletteSize = this.palette.length || DEFAULT_PALETTE.length;
    const gridConfig = this.gameService.createGameConfig({
      cols: this.gridConfig.cols,
      rows: this.gridConfig.rows,
      paletteSize
    });

    this.grid = new GameGrid({
      canvas: this.boardCanvas.nativeElement,
      width: clientWidth,
      height: clientHeight,
      grid: gridConfig,
      palette: this.palette.length ? this.palette : DEFAULT_PALETTE
    });

    this.grid.init();
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
    console.log('colorPick', event);
  }
}
