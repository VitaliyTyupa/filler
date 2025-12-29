import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'fil-color-picker',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss'
})
export class ColorPickerComponent {
  @Input({ required: true })
  users: Array<{ id: number; name: string }> = [];

  @Input({ required: true })
  palette: string[] = [];

  @Output()
  readonly colorPick = new EventEmitter<{ userId: number; colorIndex: number; colorHex: string }>();

  handleColorPick(userId: number, colorIndex: number, colorHex: string): void {
    this.colorPick.emit({ userId, colorIndex, colorHex });
  }

}
