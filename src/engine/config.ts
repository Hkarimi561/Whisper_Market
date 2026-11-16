// All tunable numbers of the game live here.

export const GOODS = ['wheat', 'fuel', 'iron', 'medicine', 'chips'] as const;
export type Good = (typeof GOODS)[number];

export const BASE_PRICES: Record<Good, number> = {
  wheat: 50,
  fuel: 80,
  iron: 100,
  medicine: 120,
  chips: 150,
};

export const CONFIG = {
  minPlayers: 3,
  maxPlayers: 6,
  /** Goods in play: players <= 4 → first 4 goods, otherwise all 5. */
  goodsForPlayers: (n: number): Good[] => (n <= 4 ? GOODS.slice(0, 4) : GOODS.slice(0, 5)) as Good[],
  startCash: 1000,
  warehouseCapacity: 12,

  magnitudes: { low: 0.1, medium: 0.2, high: 0.3 },
  stormMultiplier: 1.5,

  /** execution = price * (1 + demandImpact * netDemand) */
  demandImpact: 0.02,
  executionClamp: { min: 0.5, max: 2 },
  /** share of the execution impact carried into next round */
  carryOver: 0.5,
  /** price floor, as a share of base price */
  priceFloor: 0.2,

  /** direct trades: unit price must be within ±band of market price */
  tradeBand: 0.5,
  clueCardMaxPrice: 200,
  maxClaimsPerRound: 2,

  contract: {
    quantityMin: 3,
    quantityMax: 5,
    premiumMin: 0.4,
    premiumMax: 0.6,
  },

  rounds: { min: 6, max: 10, default: 8 },

  /** events per round: 2–3; the last (storm) round always has 3 */
  eventsPerRound: { min: 2, max: 3 },
  /** chance that a player gets a count-clue when an extra clue is needed */
  countClueChance: 0.3,

  /** seconds */
  infoSeconds: 15,
  revealStepSeconds: 5,
  finalStepSeconds: 5,
  /** Auto-advance seconds per step is applied by the server unless paused */

  chat: { maxLength: 200, maxHistory: 100 },
  nicknameMax: 14,
  roomCodeLetters: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
} as const;

export interface Settings {
  rounds: number;
  tribuneSeconds: number;
  marketSeconds: number;
  orderSeconds: number;
  whisperAllowed: boolean;
  chatEnabled: boolean;
  preset: 'open' | 'busy' | 'custom';
}

export const PRESETS: Record<'open' | 'busy', Settings> = {
  open: {
    rounds: CONFIG.rounds.default,
    tribuneSeconds: 20,
    marketSeconds: 120,
    orderSeconds: 30,
    whisperAllowed: false,
    chatEnabled: false,
    preset: 'open',
  },
  busy: {
    rounds: CONFIG.rounds.default,
    tribuneSeconds: 30,
    marketSeconds: 180,
    orderSeconds: 30,
    whisperAllowed: true,
    chatEnabled: false,
    preset: 'busy',
  },
};

export function defaultSettings(): Settings {
  return { ...PRESETS.open };
}

export function sanitizeSettings(input: Partial<Settings> | undefined, base: Settings = defaultSettings()): Settings {
  const clamp = (v: unknown, lo: number, hi: number, d: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d;
    return Math.min(hi, Math.max(lo, n));
  };
  const s = input ?? {};
  return {
    rounds: clamp(s.rounds, CONFIG.rounds.min, CONFIG.rounds.max, base.rounds),
    tribuneSeconds: clamp(s.tribuneSeconds, 5, 90, base.tribuneSeconds),
    marketSeconds: clamp(s.marketSeconds, 20, 600, base.marketSeconds),
    orderSeconds: clamp(s.orderSeconds, 10, 180, base.orderSeconds),
    whisperAllowed: typeof s.whisperAllowed === 'boolean' ? s.whisperAllowed : base.whisperAllowed,
    chatEnabled: typeof s.chatEnabled === 'boolean' ? s.chatEnabled : base.chatEnabled,
    preset: s.preset === 'open' || s.preset === 'busy' || s.preset === 'custom' ? s.preset : base.preset,
  };
}

/** Round schedule: which rounds announce / auction a contract. */
export function contractSchedule(totalRounds: number): { announce: number; auction: number }[] {
  const second = Math.max(4, Math.round((2 * totalRounds) / 3));
  return [
    { announce: 2, auction: 3 },
    { announce: second, auction: second + 1 },
  ];
}
