import { Component, EventEmitter, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCard, MatCardContent } from '@angular/material/card';
import { SessionUiStore } from '../../../game/session-ui.store';

@Component({
  selector: 'fil-color-picker',
  standalone: true,
  imports: [MatButtonModule, MatCard, MatCardContent],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss'
})
export class ColorPickerComponent {
  @Output()
  readonly colorPick = new EventEmitter<{ userId: number; colorIndex: number; colorHex: string }>();

  constructor(readonly sessionUiStore: SessionUiStore) {}

  selfLabel(name: string): string {
    return $localize`:@@selfLabel:Я ${name}:name:`;
  }

  opponentLabel(name: string): string {
    return $localize`:@@opponentLabel:Проти ${name}:name:`;
  }

  connectionStatus(status: 'connected' | 'disconnected'): string {
    return status === 'connected'
      ? $localize`:@@playerConnected:Підключений`
      : $localize`:@@playerDisconnected:Відключений`;
  }

  handleColorPick(colorIndex: number, colorHex: string): void {
    const self = this.sessionUiStore.selfPlayer();
    if (!self) {
      return;
    }

    this.colorPick.emit({ userId: self.id, colorIndex, colorHex });
  }
}
