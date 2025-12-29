import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { GameSessionService, GameSettings } from '../game-session.service';

@Component({
  selector: 'fil-waiting-page',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatTabsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './waiting-page.component.html',
  styleUrl: './waiting-page.component.scss'
})
export class WaitingPageComponent implements OnInit, OnDestroy {
  settings?: GameSettings;
  player2Name = 'OnlinePlayer';
  isWaiting = true;
  private joinTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly router: Router,
    private readonly gameSession: GameSessionService
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

    this.joinTimer = setTimeout(() => {
      this.isWaiting = false;
      this.updatePlayerTwoName(this.player2Name);
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.joinTimer) {
      clearTimeout(this.joinTimer);
    }
  }

  onReject(): void {
    console.log('reject');
    this.gameSession.clear();
    this.router.navigateByUrl('/start');
  }

  onStartGame(): void {
    console.log('start online game');
    this.router.navigateByUrl('/game');
  }

  private updatePlayerTwoName(name: string): void {
    if (!this.settings) {
      return;
    }

    this.settings = {
      ...this.settings,
      players: this.settings.players.map((player) =>
        player.id === 2 ? { ...player, name } : player
      )
    };

    this.gameSession.setSettings(this.settings);
  }
}
