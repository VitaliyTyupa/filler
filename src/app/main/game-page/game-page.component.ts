import { Component } from '@angular/core';
import {GameGridComponent} from './game-grid/game-grid.component';

@Component({
  selector: 'fil-game-page',
  imports: [
    GameGridComponent
  ],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.scss'
})
export class GamePageComponent {

}
