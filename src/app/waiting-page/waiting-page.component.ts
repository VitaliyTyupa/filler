import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { OpenGameListItem } from '@shared';
import { AuthService } from '../auth/auth.service';
import { GameSessionService, GameSettings } from '../game-session.service';
import { GameRealtimeService } from '../game/realtime/game-realtime.service';

@Component({
  selector: 'fil-waiting-page',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatTabsModule
  ],
  templateUrl: './waiting-page.component.html',
  styleUrl: './waiting-page.component.scss'
})
export class WaitingPageComponent implements OnInit, OnDestroy {
  settings?: GameSettings;
  openGames: OpenGameListItem[] = [];
  isPublishing = false;
  isJoining = false;
  canStart = false;
  hostConnected = false;
  guestConnected = false;
  errorMessage = '';
  private subscriptions: Subscription[] = [];

  constructor(
    private readonly router: Router,
    readonly gameSession: GameSessionService,
    private readonly realtimeService: GameRealtimeService,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    const currentSettings = this.gameSession.getSettings();
    if (!currentSettings || currentSettings.mode !== 'online') {
      void this.router.navigateByUrl('/start');
      return;
    }

    this.settings = currentSettings;
    this.subscriptions.push(
      this.realtimeService.openGames$.subscribe((games) => {
        this.openGames = games;
        this.syncGuestSessionWithSnapshot(games);
      }),
      this.realtimeService.lobbyState$.subscribe((state) => {
        if (state.sessionId !== this.currentSessionId) {
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
        if (state.sessionId !== this.currentSessionId) {
          return;
        }

        const role = this.currentRole;
        if (!role) {
          this.errorMessage = $localize`:@@waitingRoleDetectFailed:Не вдалося визначити роль гравця`;
          return;
        }

        this.gameSession.setRealtimeSession({
          sessionId: state.sessionId,
          started: true,
          role,
          hostName: state.hostName,
          guestName: state.guestName,
          startedAt: new Date().toISOString()
        });
        void this.router.navigateByUrl('/game');
      })
    );

    void this.realtimeService.ensureLobbyConnection().catch((error: unknown) => {
      this.errorMessage = error instanceof Error ? error.message : $localize`:@@waitingLobbyConnectFailed:Не вдалося підключитись до lobby`;
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    const realtimeSession = this.gameSession.getRealtimeSession();
    if (realtimeSession && !realtimeSession.started) {
      this.realtimeService.disconnectOnlineSessions();
      this.gameSession.clearRealtimeSession();
    }
  }

  get currentSessionId(): string | undefined {
    return this.gameSession.getRealtimeSession()?.sessionId;
  }

  get currentRole(): 'host' | 'guest' | undefined {
    return this.gameSession.getRealtimeSession()?.role;
  }

  get canPublishOwnGame(): boolean {
    return !this.isPublishing && !this.currentSessionId;
  }

  get canJoinOtherOpenGames(): boolean {
    if (!this.currentSessionId) {
      return true;
    }

    return this.currentRole === 'host' && !!this.currentPublishedGame;
  }

  get currentPublishedGame(): OpenGameListItem | null {
    if (this.currentRole !== 'host' || !this.currentSessionId) {
      return null;
    }

    return this.openGames.find((game) => game.sessionId === this.currentSessionId) ?? null;
  }

  get currentGuestGame(): OpenGameListItem | null {
    if (this.currentRole !== 'guest' || !this.currentSessionId) {
      return null;
    }

    return this.openGames.find((game) => game.sessionId === this.currentSessionId) ?? null;
  }

  async onPublishOwnGame(): Promise<void> {
    if (!this.settings || !this.canPublishOwnGame) {
      return;
    }

    this.errorMessage = '';
    this.isPublishing = true;
    try {
      const playerName = this.localPlayerName();
      const created = await this.realtimeService.publishOpenGame({
        cols: this.settings.board.cols,
        rows: this.settings.board.rows,
        paletteSize: this.settings.paletteSize,
        seed: Date.now() >>> 0,
        playerName,
        mode: 'online'
      });

      this.gameSession.setRealtimeSession({
        sessionId: created.sessionId,
        started: false,
        role: 'host',
        hostName: created.hostName,
        guestName: created.guestName
      });
      this.applyAuthoritativeOnlineSettings(created.state.cols, created.state.rows, created.state.paletteSize, created.hostName, created.guestName);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : $localize`:@@waitingLobbyCreateFailed:Не вдалося створити lobby`;
    } finally {
      this.isPublishing = false;
    }
  }

  async onJoinOpenGame(game: OpenGameListItem): Promise<void> {
    if (!this.settings || !this.canJoinOtherOpenGames || game.status !== 'free') {
      return;
    }

    this.errorMessage = '';
    this.isJoining = true;
    try {
      const joined = await this.realtimeService.requestOpenGameJoin(game.sessionId, this.localPlayerName());
      if (!joined) {
        this.errorMessage = $localize`:@@waitingLobbyNotFound:Lobby не знайдено`;
        return;
      }

      this.gameSession.setRealtimeSession({
        sessionId: joined.sessionId,
        started: false,
        role: 'guest',
        hostName: joined.hostName,
        guestName: joined.guestName
      });
      this.applyAuthoritativeOnlineSettings(game.cols, game.rows, game.paletteSize, joined.hostName, joined.guestName);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : $localize`:@@waitingLobbyJoinFailed:Не вдалося підключитись до lobby`;
    } finally {
      this.isJoining = false;
    }
  }

  onCancelJoinRequest(): void {
    if (this.currentRole !== 'guest' || !this.currentSessionId) {
      return;
    }

    this.errorMessage = '';
    this.realtimeService.cancelOpenGameJoin(this.currentSessionId);
  }

  onConfirmJoinRequest(): void {
    if (this.currentRole !== 'host' || !this.currentSessionId) {
      return;
    }

    this.errorMessage = '';
    this.realtimeService.confirmOpenGameJoin(this.currentSessionId);
  }

  onRejectJoinRequest(): void {
    if (this.currentRole !== 'host' || !this.currentSessionId) {
      return;
    }

    this.errorMessage = '';
    this.realtimeService.rejectOpenGameJoin(this.currentSessionId);
  }

  onStartGame(): void {
    if (this.currentRole !== 'host' || !this.currentSessionId || !this.canStart) {
      return;
    }

    this.errorMessage = '';
    this.realtimeService.startGame(this.currentSessionId);
  }

  onBackToSetup(): void {
    this.realtimeService.disconnectOnlineSessions();
    this.gameSession.clear();
    void this.router.navigateByUrl('/start');
  }

  statusLabel(status: OpenGameListItem['status']): string {
    switch (status) {
      case 'free':
        return $localize`:@@waitingStatusFree:Вільний`;
      case 'joining':
        return $localize`:@@waitingStatusJoining:Приєднання`;
      case 'confirmed':
        return $localize`:@@waitingStatusBusy:Зайнятий`;
    }
  }

  statusClass(status: OpenGameListItem['status']): string {
    switch (status) {
      case 'free':
        return 'status-chip--free';
      case 'joining':
        return 'status-chip--joining';
      case 'confirmed':
        return 'status-chip--confirmed';
    }
  }

  isCurrentGuestGame(game: OpenGameListItem): boolean {
    return this.currentRole === 'guest' && this.currentSessionId === game.sessionId;
  }

  isCurrentPublishedGame(game: OpenGameListItem): boolean {
    return this.currentRole === 'host' && this.currentSessionId === game.sessionId;
  }

  localPlayerName(): string {
    return this.authService.user?.username?.trim()
      || this.settings?.players.find((player) => player.id === 1)?.name
      || $localize`:@@playerFallbackName:Гравець ${1}:playerId:`;
  }

  pendingGuestLabel(): string {
    return $localize`:@@waitingPendingGuest:Очікується...`;
  }

  private syncGuestSessionWithSnapshot(games: OpenGameListItem[]): void {
    if (this.currentRole !== 'guest' || !this.currentSessionId) {
      return;
    }

    const current = games.find((game) => game.sessionId === this.currentSessionId);
    if (current) {
      return;
    }

    this.gameSession.clearRealtimeSession();
    this.hostConnected = false;
    this.guestConnected = false;
    this.canStart = false;
    this.errorMessage = $localize`:@@waitingRequestCancelled:Запит на приєднання більше не активний`;
  }

  private applyAuthoritativeOnlineSettings(
    cols: number,
    rows: number,
    paletteSize: number,
    hostName?: string,
    guestName?: string
  ): void {
    const currentSettings = this.gameSession.getSettings();
    if (!currentSettings) {
      return;
    }

    const authoritativeSettings: GameSettings = {
      ...currentSettings,
      mode: 'online',
      board: { cols, rows },
      paletteSize: this.normalizePaletteSize(paletteSize),
      players: [
        {
          id: 1,
          name: hostName?.trim()
            || currentSettings.players.find((player) => player.id === 1)?.name
            || $localize`:@@playerFallbackName:Гравець ${1}:playerId:`
        },
        {
          id: 2,
          name: guestName?.trim()
            || currentSettings.players[1]?.name
            || currentSettings.players[0]?.name
            || $localize`:@@playerFallbackName:Гравець ${2}:playerId:`
        }
      ]
    };

    this.gameSession.setSettings(authoritativeSettings);
    this.settings = authoritativeSettings;
  }

  private normalizePaletteSize(size: number): 5 | 7 | 10 {
    if (size === 7 || size === 10) {
      return size;
    }
    return 5;
  }
}
