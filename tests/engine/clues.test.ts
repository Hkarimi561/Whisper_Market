import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/engine/config';
import { EVENT_TEMPLATES } from '../../src/engine/content';
import { dealClues, generateEvents, knownComponents, validateDeal } from '../../src/engine/events';
import { Rng } from '../../src/engine/rng';

describe('event templates', () => {
  it('has at least 30 templates with Persian text', () => {
    expect(EVENT_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    for (const t of EVENT_TEMPLATES) expect(/[؀-ۿ]/.test(t.text)).toBe(true);
    expect(new Set(EVENT_TEMPLATES.map((t) => t.id)).size).toBe(EVENT_TEMPLATES.length);
  });
});

describe('events', () => {
  it('has 2-3 events, exactly one hidden, storm has 3 with x1.5 magnitudes', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Rng(seed);
      const goods = CONFIG.goodsForPlayers(4);
      const ev = generateEvents(rng, 3, false, goods);
      expect(ev.length).toBeGreaterThanOrEqual(2);
      expect(ev.length).toBeLessThanOrEqual(3);
      expect(ev.filter((e) => !e.clued).length).toBe(1);
      for (const e of ev) {
        expect(goods).toContain(e.target);
        expect(Math.abs(e.effect)).toBeCloseTo(CONFIG.magnitudes[e.magnitude], 5);
      }
      const storm = generateEvents(rng, 8, true, goods);
      expect(storm.length).toBe(3);
      for (const e of storm) expect(Math.abs(e.effect)).toBeCloseTo(CONFIG.magnitudes[e.magnitude] * 1.5, 5);
    }
  });
});

describe('clue distribution invariants (property test)', () => {
  it('holds for many seeds and every table size', () => {
    let deals = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (let n = 3; n <= 6; n++) {
        const rng = new Rng(seed * 31 + n);
        const goods = CONFIG.goodsForPlayers(n);
        const ids = Array.from({ length: n }, (_, i) => `p${i}`);
        for (const storm of [false, true]) {
          const events = generateEvents(rng, storm ? 8 : 2, storm, goods);
          const deal = dealClues(rng, storm ? 8 : 2, events, ids, goods);
          const issues = validateDeal(events, deal, ids);
          expect(issues, `seed ${seed} n ${n} storm ${storm}`).toEqual([]);
          deals++;
        }
      }
    }
    expect(deals).toBe(400 * 4 * 2);
  });

  it('no single player knows all three components of an event; clues are pairwise different', () => {
    const rng = new Rng(99);
    const goods = CONFIG.goodsForPlayers(6);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const events = generateEvents(rng, 1, false, goods);
    const deal = dealClues(rng, 1, events, ids, goods);
    for (const e of events) for (const id of ids) expect(knownComponents(e, [deal.clues[id]]).size).toBeLessThan(3);
    expect(new Set(ids.map((i) => JSON.stringify({ ...deal.clues[i], id: '' }))).size).toBe(6);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const rng = new Rng(7);
      const goods = CONFIG.goodsForPlayers(5);
      const ev = generateEvents(rng, 1, false, goods);
      return JSON.stringify([ev, dealClues(rng, 1, ev, ['a', 'b', 'c', 'd', 'e'], goods)]);
    };
    expect(run()).toBe(run());
  });
});
