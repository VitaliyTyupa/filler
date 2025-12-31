import { Injectable } from '@angular/core';

export type GameMode = 'cpu' | 'local' | 'online';
export type PlayerId = 1 | 2;

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

export interface GameResult {
  winner: 1 | 2 | 0;
  score1: number;
  score2: number;
}

@Injectable({
  providedIn: 'root'
})
export class GameSessionService {
  private settings?: GameSettings;
  private result?: GameResult;
  private roomId?: string;
  private assignedPlayerId?: PlayerId;

  setSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  getSettings(): GameSettings | undefined {
    return this.settings;
  }

  hasSettings(): boolean {
    return this.settings !== undefined;
  }

  setOnlineSession(data: { roomId: string; assignedPlayerId: PlayerId }): void {
    this.roomId = data.roomId;
    this.assignedPlayerId = data.assignedPlayerId;
  }

  getRoomId(): string | undefined {
    return this.roomId;
  }

  getAssignedPlayerId(): PlayerId | undefined {
    return this.assignedPlayerId;
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
    this.roomId = undefined;
    this.assignedPlayerId = undefined;
  }
}
