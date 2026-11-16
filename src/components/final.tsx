'use client';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { DIRECTION_ARROWS, cluePreview, describeClue, describeContract, goodName, toFa } from '../engine/describe';
import type { Title } from '../engine/types';
import type { FinalView, RecapRound } from '../engine/views';
import { fa } from '../i18n/fa';
import { sfx } from '../lib/sound';
import { AnimatedNumber, GoodIcon, Lantern, WaxSeal } from './art';

type Names = Record<string, string>;
const T = (tv: boolean, a: string, b: string) => (tv ? b : a);

const TITLE_ICON: Record<Title['id'], string> = {
  honest: '🕊',
  bluffMaster: '🎭',
  infoBroker: '✉',
  loneWolf: '🐺',
  contractHunter: '⚖',
  stormMan: '⛈',
};

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ i, x: (i * 37) % 100, d: 2 + ((i * 13) % 20) / 10, c: ['#f4b24a', '#ffd27a', '#c19a52', '#e0832b', '#62d3a0'][i % 5], r: (i * 53) % 360 })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <motion.span key={b.i} className="absolute top-0 block h-3 w-1.5 rounded-sm" style={{ left: `${b.x}%`, background: b.c }} initial={{ y: -20, rotate: 0, opacity: 1 }} animate={{ y: 360, rotate: b.r + 360, opacity: 0 }} transition={{ duration: b.d, repeat: Infinity, delay: (b.i % 7) * 0.2 }} />
      ))}
    </div>
  );
}

function Ranking({ f, names, tv, you }: { f: FinalView; names: Names; tv: boolean; you?: string | null }) {
  const rows = [...f.ranking].sort((a, b) => a.rank - b.rank);
  const lastShown = f.stage === 'rank' ? Math.min(...rows.map((r) => r.rank)) : 1;
  useEffect(() => {
    if (f.stage === 'rank') (lastShown === 1 ? sfx.fanfare : sfx.stamp)();
  }, [f.stage, lastShown]);
  return (
    <div>
      <div className="mb-4 text-center">
        <h2 className={`brass-text font-black ${T(tv, 'text-3xl', 'text-6xl')}`}>{fa.final.ranking}</h2>
        {f.stage === 'rank' && <p className={`text-fog ${T(tv, 'text-sm', 'text-2xl')}`}>{fa.final.rankingSub}</p>}
      </div>
      <ul className="mx-auto grid max-w-2xl gap-2">
        {rows.map((r) => {
          const first = r.rank === 1;
          return (
            <motion.li layout key={r.playerId} initial={{ x: 120, opacity: 0, scale: 0.8 }} animate={{ x: 0, opacity: 1, scale: first ? 1.04 : 1 }} transition={{ type: 'spring', stiffness: 140, damping: 14 }} className={`relative flex items-center gap-3 overflow-hidden rounded-xl p-3 ${first ? 'paper ring-4 ring-lantern' : 'glass'} ${r.playerId === you ? 'outline outline-2 outline-lantern' : ''}`}>
              {first && <Confetti />}
              <span className={`grid shrink-0 place-items-center rounded-full font-black ${first ? 'bg-lantern text-ink' : 'bg-white/10'} ${T(tv, 'size-10 text-lg', 'size-16 text-3xl')}`}>{toFa(r.rank, false)}</span>
              <div className="relative min-w-0 flex-1">
                <p className={`truncate font-black ${T(tv, 'text-lg', 'text-4xl')}`}>
                  {first && '👑 '}
                  {names[r.playerId]}
                </p>
                <p className={`${first ? 'text-ink/70' : 'text-fog'} ${T(tv, 'text-xs', 'text-xl')}`}>
                  {fa.final.cash} {toFa(r.cash)} · {fa.final.stock} {toFa(Math.round(r.inventoryValue))}
                </p>
              </div>
              <p className={`relative font-black tabular-nums ${T(tv, 'text-xl', 'text-5xl')}`}>
                <AnimatedNumber value={Math.round(r.total)} from={0} duration={1.4} />
              </p>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function RoundRecap({ r, names, tv }: { r: RecapRound; names: Names; tv: boolean }) {
  return (
    <div className="paper grid gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={`font-black ${T(tv, 'text-lg', 'text-4xl')}`}>
          {fa.final.round} {toFa(r.n, false)}
        </h3>
        {r.storm && <span className="rounded bg-wax px-2 py-0.5 text-xs font-black text-white">{fa.storm}</span>}
      </div>
      <ul className="grid gap-1.5">
        {r.events.map((e) => (
          <li key={e.id} className={`flex items-center gap-2 rounded-lg bg-ink/10 px-2 py-1.5 ${T(tv, 'text-sm', 'text-2xl')}`}>
            <GoodIcon good={e.target} size={tv ? 40 : 28} />
            <span className="flex-1 font-bold">{e.text}</span>
            <span className={`font-black ${e.direction === 'up' ? 'text-moss' : 'text-wax'}`}>
              {DIRECTION_ARROWS[e.direction]} {toFa(Math.round(Math.abs(e.effect) * 100))}٪
            </span>
            {!e.clued && <span className="rounded bg-ink px-1.5 text-[10px] font-black text-paper">{fa.final.hiddenEvent}</span>}
          </li>
        ))}
      </ul>
      <div>
        <p className={`mb-1 font-black text-copper ${T(tv, 'text-xs', 'text-xl')}`}>{fa.final.clueOf}</p>
        <ul className={`grid gap-1 ${T(tv, '', 'grid-cols-2')}`}>
          {r.clues.map(({ playerId, clue }) => (
            <li key={playerId} className={`${T(tv, 'text-xs', 'text-xl')}`}>
              <b>{names[playerId]}:</b> {describeClue(clue)} <span className="hidden">{cluePreview(clue).topic}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className={`mb-1 font-black text-copper ${T(tv, 'text-xs', 'text-xl')}`}>{fa.final.claimsOfRound}</p>
        {r.claims.length === 0 ? (
          <p className="text-xs text-ink/60">{fa.final.noClaims}</p>
        ) : (
          <ul className="grid gap-1">
            {r.claims.map((c) => (
              <li key={c.claimId} className={`flex items-center gap-2 ${T(tv, 'text-xs', 'text-xl')}`}>
                <b>{names[c.playerId]}</b> {goodName(c.good)} {DIRECTION_ARROWS[c.direction]}
                <span className={`stamp !text-[10px] ${c.net === 'true' ? 'text-moss' : c.net === 'mixed' ? 'text-copper' : 'text-wax'}`}>{fa.reveal[c.net]}</span>
                {c.footprintConflict && <span className="font-black text-wax">↯ {c.footprint === 'buy' ? fa.reveal.butBought : fa.reveal.butSold}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={`grid gap-1 ${T(tv, 'text-xs', 'text-xl')}`}>
        <p className="font-black text-copper">{fa.final.sales}</p>
        {r.sales.length === 0 ? <p className="text-ink/60">{fa.final.noSales}</p> : r.sales.map((s, i) => <p key={i}>{names[s.sellerId]} → {names[s.buyerId]} · {toFa(s.price)}</p>)}
        <p className="mt-1 font-black text-copper">{fa.final.trades}</p>
        {r.trades.length === 0 ? (
          <p className="text-ink/60">{fa.final.noTrades}</p>
        ) : (
          r.trades.map((t) => (
            <p key={t.id}>
              {names[t.from]} ↔ {names[t.to]}: {[...Object.keys(t.give.goods), ...Object.keys(t.receive.goods)].map((g) => goodName(g as never)).join('، ')}
            </p>
          ))
        )}
        {r.auction && (
          <p className="mt-1 font-bold">
            ⚖ {describeContract(r.auction.contract)} → {r.auction.winnerId ? `${names[r.auction.winnerId]} (${toFa(r.auction.winningBid)}) · ${r.auction.delivered ? fa.reveal.delivered : fa.reveal.failed}` : fa.reveal.noWinner}
          </p>
        )}
      </div>
    </div>
  );
}

function Recap({ f, names, tv }: { f: FinalView; names: Names; tv: boolean }) {
  const rounds = f.recap ?? [];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!tv || !rounds.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % rounds.length), 9000);
    return () => clearInterval(t);
  }, [tv, rounds.length]);
  return (
    <div>
      <div className="mb-4 text-center">
        <h2 className={`brass-text font-black ${T(tv, 'text-3xl', 'text-6xl')}`}>{fa.final.recap}</h2>
        <p className={`text-fog ${T(tv, 'text-sm', 'text-2xl')}`}>{fa.final.recapSub}</p>
      </div>
      {tv ? (
        <motion.div key={idx} initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-5xl">
          {rounds[idx] && <RoundRecap r={rounds[idx]} names={names} tv />}
        </motion.div>
      ) : (
        <div className="grid gap-3">
          {rounds.map((r) => (
            <details key={r.n} open={r.n === 1}>
              <summary className="glass flex min-h-12 cursor-pointer items-center justify-between px-4 py-2 font-black">
                <span>
                  {fa.final.round} {toFa(r.n, false)} {r.storm && `· ${fa.storm}`}
                </span>
                <span className="text-fog" aria-hidden>
                  ▾
                </span>
              </summary>
              <div className="mt-2">
                <RoundRecap r={r} names={names} tv={false} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Titles({ f, names, tv }: { f: FinalView; names: Names; tv: boolean }) {
  useEffect(() => {
    sfx.fanfare();
  }, []);
  return (
    <div>
      <h2 className={`brass-text mb-4 text-center font-black ${T(tv, 'text-3xl', 'text-6xl')}`}>{fa.final.titles}</h2>
      <ul className={`mx-auto grid gap-3 ${T(tv, 'max-w-md', 'max-w-5xl grid-cols-3')}`}>
        {(f.titles ?? []).map((t, i) => (
          <motion.li key={t.id} initial={{ scale: 0.4, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: i * 0.5, type: 'spring', stiffness: 160, damping: 13 }} className="paper flex items-center gap-3 p-4">
            <WaxSeal size={tv ? 80 : 54}>{TITLE_ICON[t.id]}</WaxSeal>
            <div className="min-w-0">
              <p className={`font-black ${T(tv, 'text-lg', 'text-3xl')}`}>{fa.titles[t.id].name}</p>
              <p className={`font-black text-wax ${T(tv, 'text-xl', 'text-4xl')}`}>{names[t.playerId]}</p>
              <p className={`text-ink/70 ${T(tv, 'text-xs', 'text-xl')}`}>{fa.titles[t.id].desc}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export function FinalStage({ view, names, tv = false, you, isHost, onAgain, onNext }: { view: FinalView; names: Names; tv?: boolean; you?: string | null; isHost: boolean; onAgain: () => void; onNext: () => void }) {
  const f = view;
  return (
    <div className={tv ? 'mx-auto w-full max-w-6xl px-10 py-6' : 'px-4 pb-10 pt-4'}>
      {(f.stage === 'rank' || f.stage === 'again') && <Ranking f={f} names={names} tv={tv} you={you} />}
      {f.stage === 'recap' && <Recap f={f} names={names} tv={tv} />}
      {f.stage === 'titles' && <Titles f={f} names={names} tv={tv} />}
      {f.stage === 'again' && f.titles && <div className="mt-6"><Titles f={f} names={names} tv={tv} /></div>}
      {(f.stage === 'recap' || f.stage === 'titles') && !tv && isHost && (
        <button className="btn btn-brass mt-5 w-full" onClick={onNext}>
          {fa.final.continue}
        </button>
      )}
      {f.stage === 'again' && !tv && (
        <div className="mt-8 grid place-items-center gap-3 text-center">
          {isHost ? (
            <motion.button whileTap={{ scale: 0.95 }} animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} className="btn btn-brass w-full !min-h-16 text-2xl" onClick={onAgain}>
              {fa.final.again}
            </motion.button>
          ) : (
            <div className="grid place-items-center gap-2 text-fog">
              <Lantern size={34} />
              <p className="font-bold">{fa.final.againWait}</p>
            </div>
          )}
        </div>
      )}
      {f.stage === 'again' && tv && <p className="mt-8 text-center text-4xl font-black text-lantern">{fa.final.again}</p>}
    </div>
  );
}
