import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GameSessionService, GameResult, GameSettings } from '../game-session.service';

@Component({
  selector: 'fil-final-page',
  standalone: true,
  imports: [CommonModule],
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
    }
  }

  restart(): void {
    this.gameSession.clear();
    this.router.navigateByUrl('/start');
  }
}
