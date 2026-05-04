import { Routes } from '@angular/router';
import { GamePageComponent } from './main/game-page/game-page.component';
import { StartPageComponent } from './start-page/start-page.component';
import { WaitingPageComponent } from './waiting-page/waiting-page.component';
import { FinalPageComponent } from './final-page/final-page.component';
import { LoginPageComponent } from './auth/login-page/login-page.component';
import { RegisterPageComponent } from './auth/register-page/register-page.component';
import { anonymousOnlyGuard, authRequiredGuard } from './auth/auth.guards';

export const routes: Routes = [
  { path: '', redirectTo: '/start', pathMatch: 'full' },
  { path: 'login', component: LoginPageComponent, canActivate: [anonymousOnlyGuard] },
  { path: 'register', component: RegisterPageComponent, canActivate: [anonymousOnlyGuard] },
  { path: 'start', component: StartPageComponent, canActivate: [authRequiredGuard] },
  { path: 'game', component: GamePageComponent, canActivate: [authRequiredGuard] },
  { path: 'waiting', component: WaitingPageComponent, canActivate: [authRequiredGuard] },
  { path: 'final', component: FinalPageComponent, canActivate: [authRequiredGuard] }
];
