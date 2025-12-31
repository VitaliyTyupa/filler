import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameSessionService, GameSettings, PlayerId } from '../game-session.service';
import { OnlineGameService, PlayersView } from '../online-game.service';

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
    MatProgressSpinnerModule
  ],
  templateUrl: './waiting-page.component.html',
  styleUrl: './waiting-page.component.scss'
})
export class WaitingPageComponent implements OnInit, OnDestroy {
  settings?: GameSettings;
  roomId?: string;
  players: PlayersView = {};
  status = 'lobby';
  joinCode = '';
  isHost = false;
  private subscriptions: Subscription[] = [];

  constructor(
    private readonly router: Router,
    private readonly gameSession: GameSessionService,
    private readonly onlineGame: OnlineGameService
  ) {}

  ngOnInit(): void {
    const currentSettings = this.gameSession.getSettings();

    if (!currentSettings || currentSettings.mode !== 'online') {
      this.router.navigateByUrl('/start');
      return;
    }

    this.settings = currentSettings;
    this.players = { 1: { name: this.settings.players[0]?.name ?? 'Player 1' } };

    this.onlineGame.connect();
    this.restoreExistingSession();
    this.registerSubscriptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.onlineGame.disconnect();
  }

  get hasSecondPlayer(): boolean {
    return Boolean(this.players[2]);
  }

  onCreateRoom(): void {
    if (!this.settings) {
      return;
    }

    this.onlineGame.createRoom({
      name: this.settings.players[0]?.name ?? 'Player 1',
      settings: {
        cols: this.settings.board.cols,
        rows: this.settings.board.rows,
        paletteSize: this.settings.paletteSize
      }
    });
  }

  onJoinRoom(): void {
    if (!this.settings) {
      return;
    }

    const code = this.joinCode.trim();

    if (!code) {
      return;
    }

    this.onlineGame.joinRoom({
      roomId: code,
      name: this.settings.players[0]?.name ?? 'Player'
    });
  }

  onStartGame(): void {
    if (!this.roomId) {
      return;
    }

    this.onlineGame.startRoom({ roomId: this.roomId });
  }

  private restoreExistingSession(): void {
    const roomId = this.gameSession.getRoomId();
    const assignedPlayerId = this.gameSession.getAssignedPlayerId();

    if (roomId) {
      this.roomId = roomId;
      this.isHost = assignedPlayerId === 1;
    }
  }

  private registerSubscriptions(): void {
    this.subscriptions.push(
      this.onlineGame.roomCreated$.subscribe((payload) => {
        this.handleRoomEvent(payload, 1);
      }),
      this.onlineGame.roomJoined$.subscribe((payload) => {
        const assignedPlayerId = this.gameSession.getAssignedPlayerId() ?? 2;
        this.handleRoomEvent(payload, assignedPlayerId);
      }),
      this.onlineGame.roomUpdate$.subscribe((payload) => {
        this.applyRoomPayload(payload);
      }),
      this.onlineGame.gameState$.subscribe((state) => {
        this.onGameState(state);
      }),
      this.onlineGame.error$.subscribe((err) => {
        console.error('[online] error', err);
      })
    );
  }

  private handleRoomEvent(
    payload: { roomId: string; players?: PlayersView; status?: string },
    assignedPlayerId: PlayerId
  ): void {
    this.applyRoomPayload(payload);
    this.gameSession.setOnlineSession({ roomId: payload.roomId, assignedPlayerId });
    this.isHost = assignedPlayerId === 1;
  }

  private applyRoomPayload(payload: { roomId: string; players?: PlayersView; status?: string }): void {
    this.roomId = payload.roomId;
    this.status = payload.status ?? this.status;

    if (payload.players) {
      this.players = payload.players;
      this.updatePlayerNames(payload.players);
    }
  }

  private updatePlayerNames(view: PlayersView): void {
    if (!this.settings) {
      return;
    }

    const updatedPlayers = this.settings.players.map((player) => {
      const playerName = view[player.id as PlayerId]?.name;

      if (!playerName) {
        return player;
      }

      return { ...player, name: playerName };
    });

    this.settings = {
      ...this.settings,
      players: updatedPlayers
    };

    this.gameSession.setSettings(this.settings);
  }

  private onGameState(_: any): void {
    if (!this.roomId) {
      return;
    }

    const assignedPlayerId = this.gameSession.getAssignedPlayerId();

    if (assignedPlayerId) {
      this.gameSession.setOnlineSession({ roomId: this.roomId, assignedPlayerId });
    }

    this.router.navigateByUrl('/game');
  }
}
