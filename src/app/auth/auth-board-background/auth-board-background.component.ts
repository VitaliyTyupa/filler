import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

type BackgroundCellTone = 'mint' | 'sky' | 'gold' | 'rose' | 'lavender' | 'peach';
type BackgroundCellRegion = 'one' | 'two' | 'contest';

interface BackgroundCell {
  id: number;
  tone: BackgroundCellTone;
  owner: 0 | 1 | 2;
  region: BackgroundCellRegion;
  waveOneDelay: string;
  waveTwoDelay: string;
  idleDelay: string;
  clashDelay: string;
  marker?: '1' | '2';
}

@Component({
  selector: 'fil-auth-board-background',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth-board-background.component.html',
  styleUrl: './auth-board-background.component.scss'
})
export class AuthBoardBackgroundComponent {
  readonly cols = 20;
  readonly rows = 10;

  readonly cells: BackgroundCell[] = Array.from({ length: this.cols * this.rows }, (_, id) => {
    const row = Math.floor(id / this.cols);
    const col = id % this.cols;
    const tone = this.resolveTone(row, col);
    const owner = this.resolveOwner(row, col);
    const region = this.resolveRegion(row, col);
    const marker = this.resolveMarker(row, col);
    const waveOneDelay = `${((row + col) * 0.14).toFixed(2)}s`;
    const waveTwoDelay = `${(((this.rows - 1 - row) + (this.cols - 1 - col)) * 0.14 + 3.8).toFixed(2)}s`;
    const idleDelay = `${(((row * 7 + col * 3) % 13) * 0.18).toFixed(2)}s`;
    const clashDelay = `${(((row + col) * 0.11 + 2.4) % 4.6).toFixed(2)}s`;

    return { id, tone, owner, region, waveOneDelay, waveTwoDelay, idleDelay, clashDelay, marker };
  });

  private resolveTone(row: number, col: number): BackgroundCellTone {
    const tones: BackgroundCellTone[] = ['mint', 'sky', 'gold', 'rose', 'lavender', 'peach'];
    return tones[(row * 3 + col * 5) % tones.length];
  }

  private resolveOwner(row: number, col: number): 0 | 1 | 2 {
    if ((row <= 1 && col <= 2) || (row === 2 && col === 0)) {
      return 1;
    }

    if ((row >= this.rows - 2 && col >= this.cols - 3) || (row === this.rows - 3 && col === this.cols - 1)) {
      return 2;
    }

    return 0;
  }

  private resolveRegion(row: number, col: number): BackgroundCellRegion {
    const distanceToOne = row + col;
    const distanceToTwo = (this.rows - 1 - row) + (this.cols - 1 - col);
    const delta = Math.abs(distanceToOne - distanceToTwo);

    if (delta <= 2) {
      return 'contest';
    }

    return distanceToOne < distanceToTwo ? 'one' : 'two';
  }

  private resolveMarker(row: number, col: number): '1' | '2' | undefined {
    if (row === 0 && col === 0) {
      return '1';
    }

    if (row === this.rows - 1 && col === this.cols - 1) {
      return '2';
    }

    return undefined;
  }
}
