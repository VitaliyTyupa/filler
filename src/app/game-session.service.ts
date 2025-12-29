import { Injectable } from '@angular/core';

export type GameMode = 'cpu' | 'local' | 'online';

export type BoardPreset =
  | { cols: 25; rows: 20 }
  | { cols: 50; rows: 40 }
  | { cols: 80; rows: 70 }
  | { cols: 100; rows: 85 }
  | { cols: 220; rows: 200 };

export interface GameSettings {
  mode: GameMode;
  board: { cols: number; rows: number };
  paletteSize: 5 | 7 | 10;
  players: Array<{ id: 1 | 2; name: string; isCpu?: boolean }>;
}

@Injectable({
  providedIn: 'root'
})
export class GameSessionService {
  private settings?: GameSettings;

  setSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  getSettings(): GameSettings | undefined {
    return this.settings;
  }

  hasSettings(): boolean {
    return this.settings !== undefined;
  }

  clear(): void {
    this.settings = undefined;
  }
}
