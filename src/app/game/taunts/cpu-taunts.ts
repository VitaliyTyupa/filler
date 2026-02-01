export type TauntTone = 'winning' | 'losing' | 'neutral' | 'endWinning' | 'endLosing';

export const CPU_TAUNTS: Record<TauntTone, readonly string[]> = {
  winning: [
    'CPU is cruising.',
    'CPU is taking control.',
    'CPU is pulling ahead.',
    'CPU is in the driver’s seat.'
  ],
  losing: [
    'CPU is feeling the pressure.',
    'CPU needs a comeback.',
    'CPU is on the back foot.',
    'CPU is running out of space.'
  ],
  neutral: [
    'CPU is weighing its options.',
    'CPU is sizing you up.',
    'CPU is keeping it close.',
    'CPU is staying steady.'
  ],
  endWinning: [
    'CPU claims the board!',
    'CPU takes the win.',
    'CPU seals the victory.'
  ],
  endLosing: [
    'CPU has been outplayed.',
    'CPU concedes the board.',
    'CPU falls this round.'
  ]
};
