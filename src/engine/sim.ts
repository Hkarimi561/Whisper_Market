// Headless simulation: bots play a whole game without timers. Used by tests and `npm run sim`.
import { applyAction, type Action } from './actions';
import { defaultSettings, type Settings } from './config';
import { advance, createMatch, totals } from './game';
import { botTick, newBotMemory, type BotMemory } from './bots';
import { Rng } from './rng';
import type { GameState } from './types';
import { buildPlayerView } from './views';

export interface SimResult {
  state: GameState;
  actionsApplied: number;
  conservationChecks: number;
  errors: string[];
}

export function runBotMatch(opts: { seed: number; bots?: number; settings?: Partial<Settings> }): SimResult {
  const n = opts.bots ?? 4;
  const settings = { ...defaultSettings(), ...opts.settings };
  const players = Array.from({ length: n }, (_, i) => ({ id: `bot${i + 1}`, nickname: `ربات ${i + 1}`, isBot: true }));
  let now = 1_000_000;
  const s = createMatch({ seed: opts.seed, settings, players }, now);
  const rng = new Rng(opts.seed ^ 0x9e3779b9);
  const mem = new Map<string, BotMemory>(players.map((p) => [p.id, newBotMemory()]));
  const errors: string[] = [];
  let actionsApplied = 0;
  let checks = 0;
  let guard = 0;

  const stepsAfterFinal = n + 2;
  while (!(s.phase === 'final' && s.step >= stepsAfterFinal) && guard++ < 5000) {
    if (s.phase === 'market' || s.phase === 'orders') {
      let progressed = true;
      let loops = 0;
      while (progressed && loops++ < 200) {
        progressed = false;
        for (const p of players) {
          const view = buildPlayerView(s, p.id, { code: 'SIMX', now, connected: () => true });
          const a: Action | null = botTick(view, mem.get(p.id)!, rng, now, true);
          if (!a) continue;
          progressed = true;
          const before = totals(s);
          try {
            applyAction(s, p.id, a, now);
            actionsApplied++;
          } catch (e) {
            const code = (e as { code?: string }).code ?? String(e);
            // rule rejections (e.g. warehouse-full) are expected and harmless; real errors are not
            if (!['warehouse-full', 'not-enough-assets', 'trade-band', 'not-enough-cash', 'already-bought'].includes(code)) errors.push(`${p.id}:${a.type}:${code}`);
          }
          if (a.type !== 'orders') {
            const after = totals(s);
            checks++;
            if (after.cash !== before.cash) errors.push(`cash not conserved by ${a.type}`);
            for (const g of s.goods) if (after.goods[g] !== before.goods[g]) errors.push(`goods not conserved by ${a.type}`);
          }
          if (s.phase !== 'market' && s.phase !== 'orders') break;
        }
      }
    }
    now += 20_000;
    advance(s, now);
  }
  return { state: s, actionsApplied, conservationChecks: checks, errors };
}
