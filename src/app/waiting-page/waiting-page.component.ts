import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { GameSessionService, GameSettings } from '../game-session.service';
import { GameRealtimeService } from '../game/realtime/game-realtime.service';

@Component({
  selector: 'fil-waiting-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatTabsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './waiting-page.component.html',
  styleUrl: './waiting-page.component.scss'
})
export class WaitingPageComponent implements OnInit, OnDestroy {
  settings?: GameSettings;
  isWaiting = true;
  isJoining = false;
  isReady = false;
  canStart = false;
  guestConnected = false;
  hostConnected = false;
  lobbyCode = '';
  joinCode = '';
  errorMessage = '';
  private subscriptions: Subscription[] = [];

  constructor(
    private readonly router: Router,
    readonly gameSession: GameSessionService,
    private readonly realtimeService: GameRealtimeService
  ) {}

  ngOnInit(): void {
    if (!this.gameSession.hasSettings()) {
      this.router.navigateByUrl('/start');
      return;
    }

    const currentSettings = this.gameSession.getSettings();
    if (!currentSettings) {
      this.router.navigateByUrl('/start');
      return;
    }

    if (currentSettings.mode !== 'online') {
      this.router.navigateByUrl('/start');
      return;
    }

    this.settings = currentSettings;
    this.subscriptions.push(
      this.realtimeService.lobbyState$.subscribe((state) => {
        if (state.sessionId !== this.lobbyCode) {
          return;
        }
        this.hostConnected = state.hostConnected;
        this.guestConnected = state.guestConnected;
        this.canStart = state.canStart;
        const session = this.gameSession.getRealtimeSession();
        if (session) {
          this.gameSession.setRealtimeSession({
            ...session,
            started: state.started,
            hostName: state.hostName,
            guestName: state.guestName
          });
        }
      }),
      this.realtimeService.gameStarted$.subscribe((state) => {
        if (state.sessionId !== this.lobbyCode) {
          return;
        }
        const role = this.gameSession.getRealtimeSession()?.role;
        if (!role) {
          this.errorMessage = 'Не вдалося визначити роль гравця';
          return;
        }
        this.gameSession.setRealtimeSession({
          sessionId: state.sessionId,
          started: true,
          role,
          hostName: state.hostName,
          guestName: state.guestName
        });
        this.router.navigateByUrl('/game');
      })
    );
    void this.ensureHostLobby();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  onReject(): void {
    console.log('reject');
    this.gameSession.clear();
    this.router.navigateByUrl('/start');
  }

  onStartGame(): void {
    if (!this.lobbyCode || !this.canStart) {
      return;
    }
    this.realtimeService.startGame(this.lobbyCode);
  }

  onToggleReady(): void {
    if (!this.lobbyCode) {
      return;
    }
    this.isReady = !this.isReady;
    this.realtimeService.setReady(this.lobbyCode, this.isReady);
  }

  async onJoinByCode(): Promise<void> {
    const code = this.joinCode.trim();
    if (!code) {
      return;
    }

    this.errorMessage = '';
    this.isJoining = true;
    try {
      const joined = await this.realtimeService.joinGame(code, this.settings?.players.find((player) => player.id === 1)?.name);
      this.isJoining = false;
      if (!joined) {
        this.errorMessage = 'Lobby не знайдено';
        return;
      }

      this.lobbyCode = joined.sessionId;
      this.gameSession.setRealtimeSession({
        sessionId: joined.sessionId,
        started: false,
        role: 'guest',
        hostName: joined.hostName,
        guestName: joined.guestName
      });
      this.isWaiting = false;
      this.isReady = false;
      this.realtimeService.setReady(this.lobbyCode, false);
    } catch (error) {
      this.isJoining = false;
      this.errorMessage = error instanceof Error ? error.message : 'Не вдалося підключитись до lobby';
    }
  }

  private async ensureHostLobby(): Promise<void> {
    const existing = this.gameSession.getRealtimeSession();
    if (existing?.sessionId) {
      if (existing.started) {
        this.router.navigateByUrl('/game');
        return;
      }
      this.lobbyCode = existing.sessionId;
      this.gameSession.setRealtimeSession({
        sessionId: existing.sessionId,
        started: false,
        role: existing.role ?? 'host',
        hostName: existing.hostName,
        guestName: existing.guestName
      });
      this.isWaiting = false;
      return;
    }

    if (!this.settings) {
      return;
    }

    try {
      const created = await this.realtimeService.createGame({
        cols: this.settings.board.cols,
        rows: this.settings.board.rows,
        paletteSize: this.settings.paletteSize,
        seed: Date.now() >>> 0,
        playerName: this.settings.players.find((player) => player.id === 1)?.name,
        mode: 'online'
      });

      this.lobbyCode = created.sessionId;
      this.gameSession.setRealtimeSession({
        sessionId: created.sessionId,
        started: false,
        role: 'host',
        hostName: created.hostName,
        guestName: created.guestName
      });
      this.isWaiting = false;
      this.isReady = false;
      this.realtimeService.setReady(this.lobbyCode, false);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Не вдалося створити lobby';
      this.isWaiting = false;
    }
  }

}
