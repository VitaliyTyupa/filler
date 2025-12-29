import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GameSessionService } from '../game-session.service';

@Component({
  selector: 'fil-waiting-page',
  standalone: true,
  templateUrl: './waiting-page.component.html',
  styleUrl: './waiting-page.component.scss'
})
export class WaitingPageComponent implements OnInit {
  constructor(
    private readonly router: Router,
    private readonly gameSession: GameSessionService
  ) {}

  ngOnInit(): void {
    if (!this.gameSession.hasSettings()) {
      this.router.navigateByUrl('/start');
      return;
    }
  }
}
