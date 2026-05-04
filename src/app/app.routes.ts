import { Routes } from '@angular/router';
import { GamePageComponent } from './main/game-page/game-page.component';
import { StartPageComponent } from './start-page/start-page.component';
import { WaitingPageComponent } from './waiting-page/waiting-page.component';
import { FinalPageComponent } from './final-page/final-page.component';
import { LoginPageComponent } from './auth/login-page/login-page.component';
import { RegisterPageComponent } from './auth/register-page/register-page.component';

export const routes: Routes = [
  { path: '', redirectTo: '/start', pathMatch: 'full' },
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'start', component: StartPageComponent },
  { path: 'game', component: GamePageComponent },
  { path: 'waiting', component: WaitingPageComponent },
  { path: 'final', component: FinalPageComponent }
];
