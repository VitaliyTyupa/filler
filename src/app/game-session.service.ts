import { Injectable } from '@angular/core';

export type GameMode = 'cpu' | 'local' | 'online';
export type CpuDifficulty = 'standard' | 'master' | 'champion' | 'ultra';

export type BoardPreset =
  | { cols: 10; rows: 10 }
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
  cpuDifficulty?: CpuDifficulty;
}

export interface GameResult {
  winner: 1 | 2 | 0;
  score1: number;
  score2: number;
}

export interface RealtimeSessionInfo {
  sessionId: string;
  started?: boolean;
  role?: 'host' | 'guest';
  hostName?: string;
  guestName?: string;
  startedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GameSessionService {
  private settings?: GameSettings;
  private result?: GameResult;
  private realtimeSession?: RealtimeSessionInfo;
  private statsRecorded = false;

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
    this.statsRecorded = false;
  }

  setRealtimeSession(session: RealtimeSessionInfo): void {
    this.realtimeSession = session;
  }

  getRealtimeSession(): RealtimeSessionInfo | undefined {
    return this.realtimeSession;
  }

  clearRealtimeSession(): void {
    this.realtimeSession = undefined;
    this.statsRecorded = false;
  }

  markStatsRecorded(): void {
    this.statsRecorded = true;
  }

  isStatsRecorded(): boolean {
    return this.statsRecorded;
  }

  clear(): void {
    this.settings = undefined;
    this.result = undefined;
    this.realtimeSession = undefined;
    this.statsRecorded = false;
  }
}
