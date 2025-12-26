import { Component } from '@angular/core';
import {MatToolbar} from '@angular/material/toolbar';
import {MatIcon} from '@angular/material/icon';
import {MatIconButton} from '@angular/material/button';
import {GamePageComponent} from './game-page/game-page.component';
import {MatProgressBar} from '@angular/material/progress-bar';

@Component({
  selector: 'fil-main',
  imports: [
    MatToolbar,
    MatIcon,
    MatIconButton,
    GamePageComponent,
    MatProgressBar
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss'
})
export class MainComponent {

}
