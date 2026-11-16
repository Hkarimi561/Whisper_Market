// Event generation and clue distribution.
import { CONFIG, type Good } from './config';
import { EVENT_TEMPLATES } from './content';
import { Rng } from './rng';
import type { Clue, Component, GameEvent, Magnitude, PublicNews } from './types';

const SUBSETS: Component[][] = [
  ['target', 'direction'],
  ['target', 'magnitude'],
  ['direction', 'magnitude'],
];

export function eventEffect(direction: 'up' | 'down', magnitude: Magnitude, storm: boolean): number {
  const m = CONFIG.magnitudes[magnitude] * (storm ? CONFIG.stormMultiplier : 1);
  return Math.round((direction === 'up' ? m : -m) * 1000) / 1000;
}

export function generateEvents(rng: Rng, roundNo: number, storm: boolean, goods: Good[]): GameEvent[] {
  const count = storm ? 3 : rng.int(CONFIG.eventsPerRound.min, CONFIG.eventsPerRound.max);
  const events: GameEvent[] = [];
  const usedTemplates = new Set<string>();
  const usedKeys = new Set<string>();
  let guard = 0;
  while (events.length < count && guard++ < 500) {
    const tpl = rng.pick(EVENT_TEMPLATES);
    if (usedTemplates.has(tpl.id)) continue;
    const targets = tpl.targets.filter((g) => goods.includes(g));
    if (!targets.length) continue;
    const target = rng.pick(targets);
    const key = `${target}:${tpl.direction}`;
    if (usedKeys.has(key)) continue;
    const r = rng.next();
    const magnitude: Magnitude = r < 0.35 ? 'low' : r < 0.75 ? 'medium' : 'high';
    usedTemplates.add(tpl.id);
    usedKeys.add(key);
    events.push({
      id: `r${roundNo}e${events.length + 1}`,
      templateId: tpl.id,
      text: tpl.text,
      target,
      direction: tpl.direction,
      magnitude,
      effect: eventEffect(tpl.direction, magnitude, storm),
      clued: true,
    });
  }
  // exactly one hidden (un-clued) event per round
  events[rng.int(0, events.length - 1)].clued = false;
  return events;
}

function componentClue(rng: Rng, e: GameEvent, subsetIdx: number, id: string): Clue {
  const sub = SUBSETS[subsetIdx];
  const c: Clue = { id, kind: 'components', eventId: e.id };
  if (sub.includes('target')) c.target = e.target;
  if (sub.includes('direction')) c.direction = e.direction;
  if (sub.includes('magnitude')) c.magnitude = e.magnitude;
  void rng;
  return c;
}

export function clueKey(c: Clue): string {
  return c.kind === 'count'
    ? `count:${c.countGood}:${c.count}`
    : `comp:${c.eventId}:${c.target ?? ''}:${c.direction ?? ''}:${c.magnitude ?? ''}`;
}

export function subsetIndexOf(c: Clue): number {
  const comps: Component[] = [];
  if (c.target) comps.push('target');
  if (c.direction) comps.push('direction');
  if (c.magnitude) comps.push('magnitude');
  return SUBSETS.findIndex((s) => s.length === comps.length && s.every((x) => comps.includes(x)));
}

export interface Deal {
  clues: Record<string, Clue>;
  news: PublicNews;
}

/** Deal one clue to each player and pick the public news. */
export function dealClues(rng: Rng, roundNo: number, events: GameEvent[], playerIds: string[], goods: Good[]): Deal {
  const clued = events.filter((e) => e.clued);
  const N = playerIds.length;
  const pool: Clue[] = [];
  const used = new Set<string>();
  const subsetsUsed = new Map<string, number[]>(); // eventId -> subset indices dealt
  let seq = 0;
  const nextId = () => `r${roundNo}c${++seq}`;

  const addComp = (e: GameEvent, idx: number) => {
    const c = componentClue(rng, e, idx, nextId());
    used.add(clueKey(c));
    pool.push(c);
    subsetsUsed.set(e.id, [...(subsetsUsed.get(e.id) ?? []), idx]);
  };

  // phase 1: two distinct subsets for every clued event (as far as there are players)
  let budget = N;
  for (const e of rng.shuffle(clued)) {
    const order = rng.shuffle([0, 1, 2]);
    const n = Math.min(2, budget);
    for (let i = 0; i < n; i++) addComp(e, order[i]);
    budget -= n;
  }

  // phase 2: extra clues — third subsets of clued events, or count clues on goods
  const goodsInEvents = Array.from(new Set(events.map((e) => e.target)));
  const candidateGoods = rng.shuffle(goods);
  while (budget > 0) {
    const open = clued.filter((e) => (subsetsUsed.get(e.id) ?? []).length < 3);
    const useComp = open.length > 0 && rng.chance(1 - CONFIG.countClueChance);
    if (useComp) {
      const e = rng.pick(open);
      const have = subsetsUsed.get(e.id) ?? [];
      const idx = [0, 1, 2].find((i) => !have.includes(i)) as number;
      addComp(e, idx);
      budget--;
      continue;
    }
    // count clue (true statement about any good; prefer goods that have events)
    const goodsPref = rng.shuffle(goodsInEvents).concat(candidateGoods);
    let placed = false;
    for (const g of goodsPref) {
      const count = events.filter((e) => e.target === g).length;
      const c: Clue = { id: nextId(), kind: 'count', countGood: g, count };
      if (used.has(clueKey(c))) continue;
      used.add(clueKey(c));
      pool.push(c);
      placed = true;
      break;
    }
    if (!placed) {
      // fall back to any unused component clue
      const e = rng.pick(clued);
      const have = subsetsUsed.get(e.id) ?? [];
      const idx = [0, 1, 2].find((i) => !have.includes(i));
      if (idx === undefined) break;
      addComp(e, idx);
    }
    budget--;
  }

  // assign to players in random order
  const shuffled = rng.shuffle(pool);
  const clues: Record<string, Clue> = {};
  playerIds.forEach((pid, i) => (clues[pid] = shuffled[i]));

  // public news: prefer an event that cannot be reconstructed from clues alone (small tables)
  let newsEvent = rng.pick(clued);
  let newsComponent: Component = rng.chance(0.5) ? 'target' : rng.chance(0.8) ? 'direction' : 'magnitude';
  for (const e of clued) {
    const subs = subsetsUsed.get(e.id) ?? [];
    if (subs.length < 2) {
      newsEvent = e;
      const have = subs.length ? SUBSETS[subs[0]] : [];
      const missing = (['target', 'direction', 'magnitude'] as Component[]).filter((c) => !have.includes(c));
      newsComponent = rng.pick(missing.length ? missing : (['target'] as Component[]));
      break;
    }
  }
  const news: PublicNews = { eventId: newsEvent.id, component: newsComponent };
  if (newsComponent === 'target') news.target = newsEvent.target;
  if (newsComponent === 'direction') news.direction = newsEvent.direction;
  if (newsComponent === 'magnitude') news.magnitude = newsEvent.magnitude;
  return { clues, news };
}

/** What information a set of clues (plus optional public news) gives about an event. */
export function knownComponents(e: GameEvent, clues: Clue[], news?: PublicNews): Set<Component> {
  const known = new Set<Component>();
  for (const c of clues) {
    if (c.kind !== 'components' || c.eventId !== e.id) continue;
    if (c.target) known.add('target');
    if (c.direction) known.add('direction');
    if (c.magnitude) known.add('magnitude');
  }
  if (news && news.eventId === e.id) known.add(news.component);
  return known;
}

export interface DealIssue {
  rule: string;
  detail: string;
}

/** Check the distribution invariants; returns the list of violations (empty = valid). */
export function validateDeal(events: GameEvent[], deal: Deal, playerIds: string[]): DealIssue[] {
  const issues: DealIssue[] = [];
  const N = playerIds.length;
  const clueList = playerIds.map((p) => deal.clues[p]);
  const clued = events.filter((e) => e.clued);

  if (events.filter((e) => !e.clued).length !== 1) issues.push({ rule: 'one-hidden', detail: 'need exactly one hidden event' });

  // each clue is a true statement about the events
  for (const c of clueList) {
    if (!c) {
      issues.push({ rule: 'dealt', detail: 'player without clue' });
      continue;
    }
    if (c.kind === 'components') {
      const e = events.find((x) => x.id === c.eventId);
      if (!e || !e.clued) issues.push({ rule: 'true', detail: 'clue about unknown/hidden event' });
      else {
        if (c.target && c.target !== e.target) issues.push({ rule: 'true', detail: 'wrong target' });
        if (c.direction && c.direction !== e.direction) issues.push({ rule: 'true', detail: 'wrong direction' });
        if (c.magnitude && c.magnitude !== e.magnitude) issues.push({ rule: 'true', detail: 'wrong magnitude' });
      }
      const n = [c.target, c.direction, c.magnitude].filter(Boolean).length;
      if (n !== 2) issues.push({ rule: 'two-components', detail: `clue has ${n} components` });
    } else {
      const real = events.filter((e) => e.target === c.countGood).length;
      if (c.count !== real) issues.push({ rule: 'true', detail: 'wrong count' });
    }
  }

  // no player holds all three components (alone)
  for (const e of clued) {
    for (const c of clueList) {
      if (knownComponents(e, [c]).size >= 3) issues.push({ rule: 'no-full-clue', detail: `${e.id} fully known by one player` });
    }
  }

  // no two identical clues
  const keys = clueList.map(clueKey);
  if (new Set(keys).size !== keys.length) issues.push({ rule: 'unique', detail: 'duplicate clues' });

  // every clued event can be reconstructed from <=3 players' clues (+ public news)
  for (const e of clued) {
    const holders = clueList.filter((c) => c.kind === 'components' && c.eventId === e.id);
    let ok = false;
    for (let k = 1; k <= Math.min(3, holders.length) && !ok; k++) {
      ok = combos(holders, k).some((cs) => knownComponents(e, cs, deal.news).size === 3);
    }
    if (!ok) issues.push({ rule: 'reconstructable', detail: `${e.id} cannot be reconstructed` });
    // with >= 4 players, reconstruction must not rely on public news
    if (N >= 4) {
      const okNoNews = combos(holders, Math.min(2, holders.length)).some((cs) => knownComponents(e, cs).size === 3);
      if (!okNoNews) issues.push({ rule: 'reconstructable-private', detail: `${e.id} needs news at ${N} players` });
    }
  }

  // no pair knows the whole truth about every clued event (unless 3 players)
  if (N > 3 && clued.length >= 2) {
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const pair = [clueList[i], clueList[j]];
        if (clued.every((e) => knownComponents(e, pair).size === 3)) issues.push({ rule: 'pair-complete', detail: `pair ${i},${j}` });
      }
  }
  return issues;
}

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) for (const rest of combos(arr.slice(i + 1), k - 1)) out.push([arr[i], ...rest]);
  return out;
}
