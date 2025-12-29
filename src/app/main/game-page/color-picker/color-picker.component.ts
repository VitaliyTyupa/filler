import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {MatCard, MatCardContent} from '@angular/material/card';

@Component({
  selector: 'fil-color-picker',
  standalone: true,
  imports: [MatButtonModule, MatCard, MatCardContent],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss'
})
export class ColorPickerComponent {
  @Input({ required: true })
  users: Array<{ id: number; name: string; currentScore: number }> = [];

  @Input({ required: true })
  palette: string[] = [];

  @Input({ required: true })
  activeUserId!: number;

  @Input({ required: true })
  validMovesByUser!: Record<number, boolean[]>;

  @Output()
  readonly colorPick = new EventEmitter<{ userId: number; colorIndex: number; colorHex: string }>();

  handleColorPick(userId: number, colorIndex: number, colorHex: string): void {
    this.colorPick.emit({ userId, colorIndex, colorHex });
  }

}
