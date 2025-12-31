import { Component } from '@angular/core';
import {GamePageComponent} from './game-page/game-page.component';
import {NavHeaderComponent} from './nav-header/nav-header.component';

@Component({
  selector: 'fil-main',
  imports: [
    GamePageComponent,
    NavHeaderComponent
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss'
})
export class MainComponent {

}
