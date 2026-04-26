export type CpuTauntEvent = {
  tone: 'winning' | 'losing' | 'neutral' | 'endWinning' | 'endLosing';
  milestone?: 10 | 30 | 50 | 70 | 90;
  seed: number;
};
