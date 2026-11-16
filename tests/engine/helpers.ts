import { defaultSettings, type Settings } from '../../src/engine/config';
import { advance, createMatch } from '../../src/engine/game';
import type { GameState, Phase } from '../../src/engine/types';

export const NOW = 1_000_000;

export function makeGame(n = 4, seed = 1, settings: Partial<Settings> = {}, bots = false): GameState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, isBot: bots }));
  return createMatch({ seed, settings: { ...defaultSettings(), ...settings }, players }, NOW);
}

/** Advance until the given round/phase (and optional reveal/final step) is reached. */
export function goTo(s: GameState, round: number, phase: Phase, step = 0) {
  let guard = 0;
  while (!(s.round === round && s.phase === phase && s.step >= step) && guard++ < 2000) advance(s, NOW + guard);
  if (guard >= 2000) throw new Error(`could not reach ${round}/${phase}`);
}

export function errCode(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}
