import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { GameSessionService } from '../../game-session.service';
import { AuthService } from '../../auth/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { AuthUser } from '../../auth/auth.models';
import { Observable } from 'rxjs';

@Component({
  selector: 'fil-nav-header',
  imports: [
    CommonModule,
    MatToolbar,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './nav-header.component.html',
  styleUrl: './nav-header.component.scss'
})
export class NavHeaderComponent {
  readonly user$: Observable<AuthUser | null>;

  constructor(
    private readonly gameSession: GameSessionService,
    private readonly router: Router,
    private readonly authService: AuthService
  ) {
    this.user$ = this.authService.user$;
  }

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

  login(): void {
    void this.router.navigateByUrl('/login');
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/start');
  }

  openProfile(): void {
    void this.router.navigateByUrl('/profile');
  }
}
