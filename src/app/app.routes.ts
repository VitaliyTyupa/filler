import { Routes } from '@angular/router';
import { GamePageComponent } from './main/game-page/game-page.component';
import { StartPageComponent } from './start-page/start-page.component';
import { WaitingPageComponent } from './waiting-page/waiting-page.component';

export const routes: Routes = [
  { path: '', redirectTo: '/start', pathMatch: 'full' },
  { path: 'start', component: StartPageComponent },
  { path: 'game', component: GamePageComponent },
  { path: 'waiting', component: WaitingPageComponent }
];
