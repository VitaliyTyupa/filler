export const BOARD_PRESETS: Array<{ label: string; cols: number; rows: number }> = [
  { label: '25×20', cols: 25, rows: 20 },
  { label: '50×40', cols: 50, rows: 40 },
  { label: '80×70', cols: 80, rows: 70 },
  { label: '100×85', cols: 100, rows: 85 },
  { label: '220×200', cols: 220, rows: 200 }
];

export const DEFAULT_PALETTE_10: string[] = [
  '#e6194b',
  '#3cb44b',
  '#ffe119',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#46f0f0',
  '#f032e6',
  '#bfef45',
  '#fabebe'
];

export function getPalette(size: 5 | 7 | 10): string[] {
  return DEFAULT_PALETTE_10.slice(0, size);
}
