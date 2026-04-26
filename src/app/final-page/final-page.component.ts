import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { GameSessionService, GameResult, GameSettings } from '../game-session.service';

@Component({
  selector: 'fil-final-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule],
  templateUrl: './final-page.component.html',
  styleUrl: './final-page.component.scss'
})
export class FinalPageComponent implements OnInit {
  result?: GameResult;
  settings?: GameSettings;

  get winnerName(): string | null {
    if (!this.result || this.result.winner === 0) {
      return null;
    }

    return this.getPlayerName(this.result.winner);
  }

  constructor(
    private readonly gameSession: GameSessionService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.result = this.gameSession.getResult();
    this.settings = this.gameSession.getSettings();

    if (!this.result || !this.settings) {
      this.router.navigateByUrl('/start');
      return;
    }
  }

  restart(): void {
    this.gameSession.clearResult();
    this.router.navigateByUrl('/game');
  }

  newGame(): void {
    this.gameSession.clear();
    this.router.navigateByUrl('/start');
  }

  getPlayerName(playerId: 1 | 2): string {
    const fallbackName = this.settings?.players.find((player) => player.id === playerId)?.name ?? `Player ${playerId}`;
    if (this.settings?.mode !== 'online') {
      return fallbackName;
    }

    const realtimeSession = this.gameSession.getRealtimeSession();
    if (playerId === 1) {
      return realtimeSession?.hostName ?? fallbackName;
    }

    return realtimeSession?.guestName ?? fallbackName;
  }

  getPlayerScore(playerId: 1 | 2): number {
    if (!this.result) {
      return 0;
    }

    return playerId === 1 ? this.result.score1 : this.result.score2;
  }
}
