import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { GridData, GridRenderer } from './rendering/grid-renderer';

@Component({
  selector: 'fil-game-grid',
  standalone: true,
  imports: [],
  templateUrl: './game-grid.component.html',
  styleUrl: './game-grid.component.scss',
})
export class GameGridComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input() grid?: GridData;
  @Output() cellHover = new EventEmitter<number>();
  @Output() cellClick = new EventEmitter<number>();
  @ViewChild('gridContainer', { static: true }) containerRef!: ElementRef<HTMLElement>;

  private renderer = new GridRenderer();
  private resizeObserver?: ResizeObserver;
  private isReady = false;

  ngOnInit(): void {
    if (!this.grid) {
      this.grid = this.createMockGrid();
    }
  }

  ngAfterViewInit(): void {
    const container = this.containerRef.nativeElement;
    this.renderer.init(
      container,
      { palette: DEFAULT_PALETTE, clearColor: '#111', hoverLightness: 0.15 },
      {
        onHover: (cellId) => this.cellHover.emit(cellId),
        onClick: (cellId) => this.cellClick.emit(cellId),
      }
    );
    this.renderer.setData(this.grid!);
    this.observeResize(container);
    this.isReady = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.isReady && changes['grid'] && this.grid) {
      this.renderer.setData(this.grid);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isReady) return;
    const cellId = this.getCellFromEvent(event);
    this.renderer.setHover(cellId);
  }

  onClick(event: MouseEvent): void {
    if (!this.isReady) return;
    const cellId = this.getCellFromEvent(event);
    this.renderer.handleClick(cellId);
  }

  onPointerLeave(): void {
    if (!this.isReady) return;
    this.renderer.setHover(-1);
  }

  private getCellFromEvent(event: PointerEvent | MouseEvent): number {
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    return this.renderer.pickCell(localX, localY);
  }

  private observeResize(container: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      this.renderer.resize(width, height);
    });
    this.resizeObserver.observe(container);
  }

  private createMockGrid(): GridData {
    const rows = 20;
    const cols = 20;
    const paletteSize = 7;
    const colors = new Uint8Array(rows * cols);
    for (let i = 0; i < colors.length; i++) {
      colors[i] = Math.floor(Math.random() * paletteSize);
    }
    return { rows, cols, paletteSize, colors };
  }
}

const DEFAULT_PALETTE = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#277da1'];
