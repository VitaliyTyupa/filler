import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { GameGrid } from './game-grid';
import { GameService } from './game.service';
import {ColorPickerComponent} from './color-picker/color-picker.component';

const DEFAULT_PALETTE = ['#2c7be5', '#6f42c1', '#f6c343', '#e63757', '#00d97e'];

@Component({
  selector: 'fil-game-page',
  standalone: true,
  imports: [
    ColorPickerComponent
  ],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.scss'
})
export class GamePageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('boardContainer', { static: true })
  private boardContainer?: ElementRef<HTMLDivElement>;

  @ViewChild('boardCanvas', { static: true })
  private boardCanvas?: ElementRef<HTMLCanvasElement>;

  private grid?: GameGrid;
  private readonly gridConfig = { cols: 120, rows: 100};

  constructor(private readonly gameService: GameService) {}

  ngAfterViewInit(): void {
    if (!this.boardContainer || !this.boardCanvas) {
      return;
    }

    const { clientWidth, clientHeight } = this.boardContainer.nativeElement;
    const paletteSize = DEFAULT_PALETTE.length;
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
      palette: DEFAULT_PALETTE
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
}
