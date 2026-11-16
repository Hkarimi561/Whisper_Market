'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { Good } from '../engine/config';
import { DIRECTION_NAMES, MAGNITUDE_NAMES, describeContract, goodName, toFa } from '../engine/describe';
import type { PlayerRoundResult } from '../engine/types';
import type { PublicPlayer, PublicView, RevealView } from '../engine/views';
import { fa } from '../i18n/fa';
import { buzz, sfx } from '../lib/sound';
import { AnimatedNumber, GoodIcon, Lantern, Trend } from './art';
import { ClaimNotice } from './shared';

type Names = Record<string, string>;

const T = (tv: boolean, a: string, b: string) => (tv ? b : a);

function useStaged(count: number, everyMs: number, startMs = 400) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    const first = setTimeout(function step() {
      i += 1;
      setN(i);
      if (i < count) setTimeout(step, everyMs);
    }, startMs);
    return () => clearTimeout(first);
  }, [count, everyMs, startMs]);
  return n;
}

function Title({ children, sub, tv }: { children: React.ReactNode; sub?: string; tv: boolean }) {
  return (
    <div className="mb-4 text-center">
      <h2 className={`brass-text font-black ${T(tv, 'text-2xl', 'text-6xl')}`}>{children}</h2>
      {sub && <p className={`mt-1 text-fog ${T(tv, 'text-sm', 'text-2xl')}`}>{sub}</p>}
    </div>
  );
}

function PricesStep({ r, goods, tv }: { r: RevealView; goods: Good[]; tv: boolean }) {
  return (
    <div>
      <Title tv={tv} sub={fa.reveal.pricesDesc}>
        {fa.reveal.prices}
      </Title>
      <ul className={`grid gap-3 ${T(tv, 'grid-cols-2', 'grid-cols-5')}`}>
        {goods.map((g, i) => {
          const net = r.netDemand[g];
          return (
            <motion.li key={g} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.12 }} className="plank flex flex-col items-center gap-1 p-3">
              <GoodIcon good={g} size={tv ? 90 : 52} />
              <p className={`font-black ${T(tv, 'text-base', 'text-3xl')}`}>{goodName(g)}</p>
              <p className={`chalk px-3 py-1 font-black ${T(tv, 'text-2xl', 'text-5xl')}`}>
                <AnimatedNumber from={r.startPrices[g]} value={r.execPrices[g]} duration={1.6} />
              </p>
              <p className={`text-fog ${T(tv, 'text-xs', 'text-xl')}`}>
                <span className="tabular-nums">{toFa(r.startPrices[g])}</span> ←
              </p>
              {net > 0 ? <Trend dir="up" label={fa.reveal.buyersWin} size={tv ? 'lg' : 'sm'} /> : net < 0 ? <Trend dir="down" label={fa.reveal.sellersWin} size={tv ? 'lg' : 'sm'} /> : <span className={`text-fog ${T(tv, 'text-xs', 'text-xl')}`}>{fa.reveal.balanced}</span>}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function EventStep({ r, goods, tv }: { r: RevealView; goods: Good[]; tv: boolean }) {
  const ev = r.events[r.events.length - 1];
  useEffect(() => {
    sfx.flip();
    buzz(20);
  }, [r.events.length]);
  if (!ev) return null;
  const effect = Math.round(Math.abs(ev.effect) * 100);
  return (
    <div>
      <Title tv={tv} sub={`${toFa(r.events.length)} / ${toFa(r.eventsTotal)}`}>
        {fa.reveal.events}
      </Title>
      <div style={{ perspective: 1000 }}>
        <motion.div key={ev.id} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} className={`paper mx-auto max-w-xl ${T(tv, 'p-5', 'p-10')}`}>
          {!ev.clued && <p className={`mb-2 inline-block rounded bg-ink px-2 py-0.5 font-black text-paper ${T(tv, 'text-xs', 'text-xl')}`}>🕳 {fa.reveal.hidden} · {fa.reveal.hiddenDesc}</p>}
          <div className="flex items-center gap-4">
            <GoodIcon good={ev.target} size={tv ? 130 : 72} />
            <div>
              <p className={`font-black leading-snug ${T(tv, 'text-xl', 'text-4xl')}`}>{ev.text}</p>
              <p className={`mt-2 font-extrabold ${T(tv, 'text-lg', 'text-3xl')} ${ev.direction === 'up' ? 'text-moss' : 'text-wax'}`}>
                {goodName(ev.target)} {ev.direction === 'up' ? '▲' : '▼'} {DIRECTION_NAMES[ev.direction]} · {MAGNITUDE_NAMES[ev.magnitude]} ({toFa(effect)}٪)
              </p>
            </div>
          </div>
        </motion.div>
      </div>
      {r.events.length > 1 && (
        <ul className="mt-3 grid gap-1.5">
          {r.events.slice(0, -1).map((e) => (
            <li key={e.id} className={`flex items-center gap-2 rounded-lg bg-black/25 px-3 py-1.5 ${T(tv, 'text-sm', 'text-xl')}`}>
              <GoodIcon good={e.target} size={tv ? 36 : 24} />
              <span className="flex-1 truncate">{e.text}</span>
              <Trend dir={e.direction} label={`${toFa(Math.round(Math.abs(e.effect) * 100))}٪`} size="sm" />
            </li>
          ))}
        </ul>
      )}
      {r.nextPrices && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="mt-4">
          <p className={`mb-2 text-center font-black text-lantern ${T(tv, 'text-sm', 'text-2xl')}`}>{fa.reveal.nextPrices}</p>
          <div className={`grid gap-2 ${T(tv, 'grid-cols-4', 'grid-cols-5')}`} style={{ gridTemplateColumns: `repeat(${goods.length}, minmax(0,1fr))` }}>
            {goods.map((g) => (
              <div key={g} className="plank flex flex-col items-center gap-1 p-2">
                <GoodIcon good={g} size={tv ? 56 : 30} />
                <span className={`chalk px-2 font-black ${T(tv, 'text-sm', 'text-2xl')}`}>
                  <AnimatedNumber from={r.execPrices[g]} value={r.nextPrices![g]} duration={1.4} />
                </span>
                {r.nextPrices![g] !== r.execPrices[g] && <Trend dir={r.nextPrices![g] > r.execPrices[g] ? 'up' : 'down'} label="" size="sm" />}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ClaimsStep({ r, names, tv }: { r: RevealView; names: Names; tv: boolean }) {
  const evals = r.claimEvals ?? [];
  const shown = useStaged(evals.length, 2400, 500);
  const [beat, setBeat] = useState(false);
  const cur = evals[shown - 1];
  useEffect(() => {
    setBeat(false);
    if (!cur) return;
    sfx.stamp();
    if (cur.footprintConflict) {
      const t = setTimeout(() => {
        setBeat(true);
        sfx.bad();
        buzz([30, 40, 30]);
      }, 1100);
      return () => clearTimeout(t);
    }
  }, [shown, cur]);
  return (
    <div>
      <Title tv={tv}>{fa.reveal.claims}</Title>
      <ul className="grid gap-3">
        {evals.slice(0, shown).map((e, i) => (
          <li key={e.claimId}>
            <ClaimNotice big={tv} claim={e} name={names[e.playerId] ?? ''} evalr={e} />
            <p className={`mt-1 px-2 text-fog ${T(tv, 'text-xs', 'text-xl')}`}>
              {e.matched > 0 && `✓ ${fa.reveal.matched} (${toFa(e.matched)})`} {e.contradicted > 0 && ` · ✗ ${fa.reveal.contradicted} (${toFa(e.contradicted)})`}
            </p>
            <AnimatePresence>
              {e.footprintConflict && i === shown - 1 && beat && (
                <motion.p initial={{ scale: 0.3, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -3 }} className={`mt-1 inline-block rounded-lg bg-wax px-3 py-1 font-black text-white shadow-xl ${T(tv, 'text-lg', 'text-4xl')}`}>
                  {e.footprint === 'buy' ? fa.reveal.butBought : fa.reveal.butSold}
                </motion.p>
              )}
              {e.footprintConflict && i < shown - 1 && <p className={`mt-1 font-black text-waxlight ${T(tv, 'text-sm', 'text-xl')}`}>↯ {e.footprint === 'buy' ? fa.reveal.butBought : fa.reveal.butSold}</p>}
            </AnimatePresence>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FootprintsStep({ r, goods, players, tv }: { r: RevealView; goods: Good[]; players: PublicPlayer[]; tv: boolean }) {
  const fp = r.footprints ?? {};
  return (
    <div>
      <Title tv={tv} sub={fa.reveal.footprintsDesc}>
        {fa.reveal.footprints}
      </Title>
      <div className="glass p-2">
        <div className="grid items-center gap-1" style={{ gridTemplateColumns: `minmax(64px,1.4fr) repeat(${goods.length}, minmax(0,1fr))` }}>
          <span />
          {goods.map((g) => (
            <div key={g} className="grid place-items-center">
              <GoodIcon good={g} size={tv ? 56 : 28} />
            </div>
          ))}
          {players.map((p, pi) => (
            <FootRow key={p.id} p={p} goods={goods} fp={fp[p.id]} delay={pi * 0.35} tv={tv} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FootRow({ p, goods, fp, delay, tv }: { p: PublicPlayer; goods: Good[]; fp: Record<Good, 'buy' | 'sell' | 'none'> | undefined; delay: number; tv: boolean }) {
  return (
    <>
      <span className={`truncate font-black ${T(tv, 'text-sm', 'text-2xl')}`}>{p.nickname}</span>
      {goods.map((g, gi) => {
        const f = fp?.[g] ?? 'none';
        return (
          <motion.div key={g} initial={{ scale: 2.2, opacity: 0, rotate: -15 }} animate={{ scale: 1, opacity: 1, rotate: f === 'none' ? 0 : -6 }} transition={{ delay: delay + gi * 0.08, type: 'spring', stiffness: 260, damping: 16 }} className="grid place-items-center py-1">
            {f === 'none' ? (
              <span className="text-fog/60">{fa.reveal.nothing}</span>
            ) : (
              <span className={`stamp !mix-blend-normal bg-paper px-1 ${T(tv, 'text-[10px]', 'text-lg')} ${f === 'buy' ? 'text-moss' : 'text-wax'}`}>
                {f === 'buy' ? '▲' : '▼'}
                <span className="block leading-none">{f === 'buy' ? fa.reveal.buyer : fa.reveal.seller}</span>
              </span>
            )}
          </motion.div>
        );
      })}
    </>
  );
}

function TradesStep({ r, names, tv }: { r: RevealView; names: Names; tv: boolean }) {
  return (
    <div>
      <Title tv={tv}>{fa.reveal.trades}</Title>
      <ul className="grid gap-2">
        {(r.trades ?? []).map((t, i) => (
          <motion.li key={i} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.3 }} className={`paper flex items-center justify-center gap-3 p-3 font-black ${T(tv, 'text-base', 'text-3xl')}`}>
            <span>{names[t.from]}</span>
            <span aria-hidden>↔</span>
            <span>{names[t.to]}</span>
            <span aria-hidden>:</span>
            {t.goods.map((g) => (
              <span key={g} className="inline-flex items-center gap-1">
                <GoodIcon good={g} size={tv ? 48 : 28} />
                {goodName(g)}
              </span>
            ))}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function AuctionStep({ r, names, tv }: { r: RevealView; names: Names; tv: boolean }) {
  const a = r.auction;
  const bids = a ? [...a.bids].reverse() : [];
  const shown = useStaged(bids.length, 1300, 700);
  const done = a && shown >= bids.length;
  useEffect(() => {
    if (!done || !a) return;
    if (a.winnerId) (a.delivered ? sfx.fanfare : sfx.bad)();
    else sfx.bad();
  }, [done, a]);
  if (!a) return null;
  return (
    <div>
      <Title tv={tv} sub={describeContract(a.contract)}>
        {fa.reveal.auction}
      </Title>
      <p className={`mb-2 text-center font-black text-brass ${T(tv, 'text-sm', 'text-2xl')}`}>{fa.reveal.bids}</p>
      <ul className="mx-auto grid max-w-lg gap-2">
        {bids.slice(0, shown).map((b, i) => (
          <motion.li key={b.playerId} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`paper flex items-center justify-between px-4 py-2 font-black ${T(tv, 'text-base', 'text-3xl')} ${done && b.playerId === a.winnerId ? 'ring-4 ring-lantern' : ''}`}>
            <span>{names[b.playerId]}</span>
            <span className="tabular-nums">{toFa(b.amount)}</span>
            <span className="sr-only">{i}</span>
          </motion.li>
        ))}
      </ul>
      {bids.length === 0 && <p className="text-center text-fog">{fa.reveal.noWinner}</p>}
      {done && a.winnerId && (
        <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} className="mt-5 text-center">
          <p className={`font-black text-lantern ${T(tv, 'text-lg', 'text-4xl')}`}>
            {fa.reveal.winner}: {names[a.winnerId]} {a.tie && `· ${fa.reveal.tie}`}
          </p>
          <span className={`stamp mt-2 bg-paper ${T(tv, 'text-xl', 'text-5xl')} ${a.delivered ? 'text-moss' : 'text-wax'}`}>{a.delivered ? `${fa.reveal.delivered} ✓` : fa.reveal.failed}</span>
        </motion.div>
      )}
    </div>
  );
}

function PrivateStep({ result, goods, tv }: { result: PlayerRoundResult | null; goods: Good[]; tv: boolean }) {
  if (tv || !result)
    return (
      <div className="grid place-items-center gap-3 py-10">
        <Lantern size={tv ? 90 : 50} />
        <p className={`text-center font-black text-paper ${T(tv, 'text-base', 'text-4xl')}`}>{fa.reveal.privateTv}</p>
      </div>
    );
  const delta = result.wealthAfter - result.wealthBefore;
  return (
    <div>
      <Title tv={false}>{fa.reveal.private}</Title>
      <div className="paper p-4">
        {result.lines.length === 0 && <p className="font-bold">{fa.reveal.nothingDone}</p>}
        <ul className="grid gap-2">
          {result.lines.map((l) => {
            const partial = l.executed !== l.requested;
            return (
              <li key={l.good} className="flex items-center gap-3">
                <GoodIcon good={l.good} size={34} />
                <div className="flex-1">
                  <p className="font-black">
                    {goodName(l.good)} · {l.executed > 0 ? fa.orders.buy : l.executed < 0 ? fa.orders.sell : fa.orders.none}
                  </p>
                  <p className="text-xs text-ink/70">
                    {toFa(Math.abs(l.executed))} × {toFa(l.unitPrice)}
                    {partial && ` · ${fa.reveal.unfilled} (${toFa(Math.abs(l.requested))})`}
                  </p>
                </div>
                <span dir="ltr" className={`font-black tabular-nums ${l.executed > 0 ? 'text-wax' : 'text-moss'}`}>
                  {(l.executed > 0 ? '−' : '+') + toFa(Math.abs(l.executed) * l.unitPrice)}
                </span>
              </li>
            );
          })}
        </ul>
        {result.auctionDelta !== 0 && (
          <p className={`mt-3 rounded-lg px-3 py-2 font-black ${result.auctionDelta > 0 ? 'bg-moss/15 text-moss' : 'bg-wax/15 text-wax'}`}>
            ⚖ {fa.reveal.auction}: <span dir="ltr">{(result.auctionDelta > 0 ? '+' : '−') + toFa(Math.abs(result.auctionDelta))}</span>
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/20 pt-3 text-center">
          <div>
            <p className="text-xs text-ink/70">{fa.reveal.cashBefore}</p>
            <p className="text-xl font-black">{toFa(result.cashBefore)}</p>
          </div>
          <div>
            <p className="text-xs text-ink/70">{fa.reveal.cashAfter}</p>
            <p className="text-xl font-black">
              <AnimatedNumber from={result.cashBefore} value={result.cashAfter} duration={1.4} />
            </p>
          </div>
        </div>
        <p className="mt-3 text-center font-black">
          {fa.reveal.wealth}: <AnimatedNumber value={result.wealthAfter} from={result.wealthBefore} duration={1.6} /> <Trend dir={delta >= 0 ? 'up' : 'down'} label={toFa(Math.abs(Math.round(delta)))} size="sm" />
        </p>
        <div className="mt-2 flex justify-center gap-1">
          {goods.map((g) => (
            <span key={g} className="inline-flex items-center text-xs font-bold">
              <GoodIcon good={g} size={20} />
              {toFa(result.inventoryAfter[g])}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RevealStage({ view, names, privateResult, tv = false }: { view: PublicView; names: Names; privateResult?: PlayerRoundResult | null; tv?: boolean }) {
  const r = view.reveal;
  if (!r) return null;
  const goods = view.goods;
  return (
    <div className={tv ? 'mx-auto w-full max-w-6xl px-10' : ''}>
      <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
        {r.steps.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === r.stepIndex ? 'w-8 bg-lantern' : i < r.stepIndex ? 'w-3 bg-brass/70' : 'w-3 bg-white/15'}`} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={`${r.stepIndex}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
          {r.kind === 'prices' && <PricesStep r={r} goods={goods} tv={tv} />}
          {r.kind === 'event' && <EventStep r={r} goods={goods} tv={tv} />}
          {r.kind === 'claims' && <ClaimsStep r={r} names={names} tv={tv} />}
          {r.kind === 'footprints' && <FootprintsStep r={r} goods={goods} players={view.players} tv={tv} />}
          {r.kind === 'trades' && <TradesStep r={r} names={names} tv={tv} />}
          {r.kind === 'auction' && <AuctionStep r={r} names={names} tv={tv} />}
          {r.kind === 'private' && <PrivateStep result={privateResult ?? null} goods={goods} tv={tv} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

