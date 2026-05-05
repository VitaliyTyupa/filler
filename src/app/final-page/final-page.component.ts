import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameSessionService, GameResult, GameSettings } from '../game-session.service';
import { AuthService } from '../auth/auth.service';
import { GameRealtimeService } from '../game/realtime/game-realtime.service';
import { StatsService } from '../stats/stats.service';

@Component({
  selector: 'fil-final-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule],
  templateUrl: './final-page.component.html',
  styleUrl: './final-page.component.scss'
})
export class FinalPageComponent implements OnInit, OnDestroy {
  result?: GameResult;
  settings?: GameSettings;
  rematchPending = false;
  private rematchSubscription?: Subscription;

  get winnerName(): string | null {
    if (!this.result || this.result.winner === 0) {
      return null;
    }

    return this.getPlayerName(this.result.winner);
  }

  constructor(
    private readonly gameSession: GameSessionService,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly realtimeService: GameRealtimeService,
    private readonly statsService: StatsService
  ) {}

  ngOnInit(): void {
    this.result = this.gameSession.getResult();
    this.settings = this.gameSession.getSettings();

    if (!this.result || !this.settings) {
      this.router.navigateByUrl('/start');
      return;
    }

    if (this.settings.mode === 'online') {
      this.rematchSubscription = this.realtimeService.rematchStarted$.subscribe((event) => {
        const session = this.gameSession.getRealtimeSession();
        if (!session || session.sessionId !== event.sessionId) {
          return;
        }

        this.rematchPending = false;
        this.gameSession.clearResult();
        this.gameSession.setRealtimeSession({
          ...session,
          started: true,
          hostName: event.hostName,
          guestName: event.guestName,
          startedAt: new Date().toISOString()
        });
        void this.router.navigateByUrl('/game');
      });
    }

    this.tryRecordStats();
  }

  restart(): void {
    if (this.settings?.mode === 'online') {
      const sessionId = this.gameSession.getRealtimeSession()?.sessionId;
      if (!sessionId || this.rematchPending) {
        return;
      }
      this.rematchPending = true;
      this.realtimeService.requestRematch(sessionId);
      return;
    }

    this.gameSession.clearResult();
    void this.router.navigateByUrl('/game');
  }

  newGame(): void {
    this.realtimeService.disconnectOnlineSessions();
    this.gameSession.clear();
    void this.router.navigateByUrl('/start');
  }

  ngOnDestroy(): void {
    this.rematchSubscription?.unsubscribe();
  }

  getPlayerName(playerId: 1 | 2): string {
    const fallbackName = this.settings?.players.find((player) => player.id === playerId)?.name
      ?? $localize`:@@playerFallbackName:Гравець ${playerId}:playerId:`;
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

  private tryRecordStats(): void {
    if (!this.result || !this.settings) {
      return;
    }

    if (!this.authService.isAuthenticated || this.gameSession.isStatsRecorded()) {
      return;
    }

    const localPlayerId = this.resolveLocalPlayerId();
    const opponentName = this.getPlayerName(localPlayerId === 1 ? 2 : 1);
    const startedAt = this.gameSession.getRealtimeSession()?.startedAt;
    const durationSeconds = startedAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000))
      : 0;

    this.statsService.recordGame({
      playedAt: new Date().toISOString(),
      durationSeconds,
      mode: this.settings.mode,
      localPlayerId,
      opponentName,
      result: this.result,
      gameConfig: {
        cols: this.settings.board.cols,
        rows: this.settings.board.rows,
        paletteSize: this.settings.paletteSize,
        cpuDifficulty: this.settings.cpuDifficulty
      }
    }).subscribe({
      next: () => this.gameSession.markStatsRecorded()
    });
  }

  private resolveLocalPlayerId(): 1 | 2 {
    if (!this.settings) {
      return 1;
    }

    if (this.settings.mode === 'online') {
      const role = this.gameSession.getRealtimeSession()?.role;
      return role === 'guest' ? 2 : 1;
    }

    return 1;
  }

  get winnerLabel(): string {
    return $localize`:@@finalWinnerLabel:Переміг`;
  }
}
