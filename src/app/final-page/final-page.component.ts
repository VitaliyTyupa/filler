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
}
