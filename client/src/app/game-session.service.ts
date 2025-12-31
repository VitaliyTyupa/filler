import { Injectable } from '@angular/core';
import { type GameResult as SharedGameResult, type PlayerId } from '@filler/shared/engine';

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
  players: Array<{ id: PlayerId; name: string; isCpu?: boolean }>;
}

export type GameResult = SharedGameResult;

@Injectable({
  providedIn: 'root'
})
export class GameSessionService {
  private settings?: GameSettings;
  private result?: GameResult;

  setSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  getSettings(): GameSettings | undefined {
    return this.settings;
  }

  hasSettings(): boolean {
    return this.settings !== undefined;
  }

  setResult(result: GameResult): void {
    this.result = result;
  }

  getResult(): GameResult | undefined {
    return this.result;
  }

  clearResult(): void {
    this.result = undefined;
  }

  clear(): void {
    this.settings = undefined;
    this.result = undefined;
  }
}
