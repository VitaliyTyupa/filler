import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { GameSessionService } from '../../game-session.service';

@Component({
  selector: 'fil-nav-header',
    imports: [
        CommonModule,
        MatProgressBar,
        MatToolbar,
        MatButtonModule
    ],
  templateUrl: './nav-header.component.html',
  styleUrl: './nav-header.component.scss'
})
export class NavHeaderComponent {
  constructor(
    private readonly gameSession: GameSessionService,
    private readonly router: Router
  ) {}

  get hasSettings(): boolean {
    return this.gameSession.hasSettings();
  }

  restart(): void {
    if (!this.hasSettings) {
      this.newGame();
      return;
    }

    this.gameSession.clearResult();
    this.router.navigateByUrl('/game');
  }

  newGame(): void {
    this.gameSession.clear();
    this.router.navigateByUrl('/start');
  }
}
