import { Component } from '@angular/core';
import {MatIcon} from '@angular/material/icon';
import {MatIconButton, MatMiniFabButton} from '@angular/material/button';
import {MatToolbar} from '@angular/material/toolbar';
import {MatCard, MatCardContent} from '@angular/material/card';

@Component({
  selector: 'fil-color-picker',
  imports: [
    MatIcon,
    MatIconButton,
    MatMiniFabButton,
    MatToolbar,
    MatCardContent,
    MatCard
  ],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss'
})
export class ColorPickerComponent {

}
