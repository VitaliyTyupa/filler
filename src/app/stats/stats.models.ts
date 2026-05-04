import { CpuDifficulty, GameMode } from '../game-session.service';

export interface RecordGameStatsRequest {
  playedAt?: string;
  durationSeconds?: number;
  mode: GameMode;
  localPlayerId: 1 | 2;
  opponentName: string;
  result: {
    winner: 1 | 2 | 0;
    score1: number;
    score2: number;
  };
  gameConfig: {
    cols: number;
    rows: number;
    paletteSize: number;
    cpuDifficulty?: CpuDifficulty;
  };
}

export interface UserStatsResponse {
  user: {
    id: string;
    username: string;
  };
  summary: {
    gamesPlayed: number;
    wins: number;
    totalPointsWon: number;
    bestSingleGamePoints: number;
  };
  leaderboard: Array<{
    place: number;
    username: string;
    gamesPlayed: number;
    wins: number;
    totalPoints: number;
  }>;
  recentGames: Array<{
    playedAt: string;
    durationSeconds: number;
    mode: GameMode;
    opponentName: string;
    won: boolean;
    pointsWon: number;
    score1: number;
    score2: number;
    gameConfig: {
      cols: number;
      rows: number;
      paletteSize: number;
      cpuDifficulty?: CpuDifficulty;
    };
  }>;
}
