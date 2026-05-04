export type StatsMode = 'cpu' | 'local' | 'online';

export interface GameStatsRecordInput {
  playedAt?: string;
  durationSeconds?: number;
  mode: StatsMode;
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
    cpuDifficulty?: 'standard' | 'master' | 'champion' | 'ultra';
  };
}

export interface GameStatsDocument {
  userId: string;
  username: string;
  playedAt: string;
  durationSeconds: number;
  mode: StatsMode;
  localPlayerId: 1 | 2;
  opponentName: string;
  won: boolean;
  pointsWon: number;
  winner: 1 | 2 | 0;
  score1: number;
  score2: number;
  gameConfig: GameStatsRecordInput['gameConfig'];
}
