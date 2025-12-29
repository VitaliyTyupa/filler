import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { GameGrid } from './game-grid';

@Component({
  selector: 'fil-game-page',
  standalone: true,
  imports: [],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.scss'
})
export class GamePageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('boardContainer', { static: true })
  private boardContainer?: ElementRef<HTMLDivElement>;

  @ViewChild('boardCanvas', { static: true })
  private boardCanvas?: ElementRef<HTMLCanvasElement>;

  private grid?: GameGrid;
  private readonly gridWidth = 40;
  private readonly gridHeight = 25;
  private readonly cellSize = 1;
  private readonly palette = ['#2c7be5'];

  ngAfterViewInit(): void {
    if (!this.boardContainer || !this.boardCanvas) {
      return;
    }

    const { clientWidth, clientHeight } = this.boardContainer.nativeElement;

    this.grid = new GameGrid({
      canvas: this.boardCanvas.nativeElement,
      width: clientWidth,
      height: clientHeight,
      grid: { rows: this.gridHeight, cols: this.gridWidth, cellSize: this.cellSize },
      palette: this.palette
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
    this.grid.resize(clientWidth, clientHeight);
  };
}
