'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '../engine/actions';
import { CONFIG, type Good } from '../engine/config';
import { DIRECTION_ARROWS, describePreview, goodName, toFa } from '../engine/describe';
import { checkTradeBand, estimateRange, totalUnits } from '../engine/prices';
import type { Bundle, TradeOffer } from '../engine/types';
import type { PlayerView } from '../engine/views';
import { fa, errorText } from '../i18n/fa';
import type { RoomState } from '../lib/protocol';
import { buzz, sfx } from '../lib/sound';
import { useCountdown, type RoomApi } from '../lib/useRoom';
import { AnimatedNumber, Fuse, GOOD_COLOR, GoodIcon, Lantern, Purse, Trend, WaxSeal, Warehouse, fmtTime } from './art';
import { FinalStage } from './final';
import { RevealStage } from './reveal';
import { ClaimNotice, ClueCardView, ClueLetter, ContractCard, GoodsRow, NewsCard, PriceTag, nameMap } from './shared';
import { Modal, MuteButton, Waiting, useToasts } from './ui';

type Act = (a: Action) => Promise<boolean>;

// ------------------------------------------------------------------ small pieces

function bundleText(b: Bundle): string {
  const parts: string[] = [];
  for (const g of Object.keys(b.goods) as Good[]) if (b.goods[g]) parts.push(`${toFa(b.goods[g]!)} ${goodName(g)}`);
  if (b.coins) parts.push(`${toFa(b.coins)} ${fa.common.coin}`);
  return parts.join(' + ') || '—';
}

function Stepper({ value, onChange, min, max, step = 1, label, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className="btn btn-ghost !min-h-11 !w-11 !px-0 text-2xl" disabled={value <= min} onClick={() => { onChange(Math.max(min, value - step)); sfx.tick(); buzz(8); }} aria-label={`${label} −`}>
        −
      </button>
      <span className="min-w-14 text-center text-xl font-black tabular-nums">{format ? format(value) : toFa(value)}</span>
      <button type="button" className="btn btn-ghost !min-h-11 !w-11 !px-0 text-2xl" disabled={value >= max} onClick={() => { onChange(Math.min(max, value + step)); sfx.tick(); buzz(8); }} aria-label={`${label} +`}>
        +
      </button>
    </div>
  );
}

function BundleEditor({ goods, value, onChange, label }: { goods: Good[]; value: Bundle; onChange: (b: Bundle) => void; label: string }) {
  return (
    <fieldset className="rounded-xl bg-black/20 p-2">
      <legend className="px-2 text-sm font-black text-lantern">{label}</legend>
      <div className="grid grid-cols-5 gap-1">
        {goods.map((g) => (
          <div key={g} className="flex flex-col items-center gap-1">
            <GoodIcon good={g} size={28} />
            <span className="text-lg font-black tabular-nums">{toFa(value.goods[g] ?? 0)}</span>
            <div className="flex gap-1">
              <button className="btn btn-ghost !min-h-11 !w-9 !px-0" onClick={() => onChange({ ...value, goods: { ...value.goods, [g]: Math.max(0, (value.goods[g] ?? 0) - 1) } })} aria-label={`${goodName(g)} −`}>
                −
              </button>
              <button className="btn btn-ghost !min-h-11 !w-9 !px-0" onClick={() => onChange({ ...value, goods: { ...value.goods, [g]: Math.min(CONFIG.warehouseCapacity, (value.goods[g] ?? 0) + 1) } })} aria-label={`${goodName(g)} +`}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
        <span className="flex items-center gap-1 text-sm font-bold">
          <Purse size={22} /> {fa.market.coins}
        </span>
        <Stepper value={value.coins} min={0} max={5000} step={10} label={fa.market.coins} onChange={(c) => onChange({ ...value, coins: c })} />
      </div>
    </fieldset>
  );
}

// ------------------------------------------------------------------ top bar

function TopBar({ view, state, api, act, left, total, onReady }: { view: PlayerView; state: RoomState; api: RoomApi; act: Act; left: number; total: number; onReady: () => void }) {
  const me = view.me;
  const hasTimer = view.deadline !== null || view.paused;
  const canReady = (view.phase === 'info' || view.phase === 'market') && !me.ready;
  const isHost = state.you === state.hostId;
  const [tools, setTools] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-brass/20 bg-night/85 px-3 pb-2 pt-2 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-fog">
            {fa.round(toFa(view.round, false), toFa(view.totalRounds, false))} {view.storm && <span className="rounded bg-wax px-1.5 py-0.5 font-black text-white">⛈ {fa.storm}</span>}
          </p>
          <p className="text-lg font-black leading-tight brass-text">{fa.phase[view.phase]}</p>
        </div>
        {hasTimer && <span className={`min-w-14 rounded-lg bg-black/40 px-2 py-1 text-center text-xl font-black tabular-nums ${left <= 5 && !view.paused ? 'text-waxlight pulse-soft' : ''}`}>{fmtTime(left)}</span>}
        {canReady && (
          <button className="btn btn-brass !min-h-11 text-sm" onClick={onReady}>
            {fa.ready}
          </button>
        )}
        {me.ready && (view.phase === 'info' || view.phase === 'market') && <span className="text-sm font-black text-mosslight">{fa.readyDone}</span>}
        <MuteButton />
        {isHost && (
          <button className="grid size-11 place-items-center rounded-full border border-brass/40 bg-white/5" aria-label={fa.hostTools} aria-expanded={tools} onClick={() => setTools((t) => !t)}>
            ⚙
          </button>
        )}
      </div>
      {hasTimer && <Fuse className="mx-auto mt-1 max-w-md" left={left} total={total} paused={view.paused} />}
      {tools && isHost && (
        <div className="mx-auto mt-2 flex max-w-md gap-2">
          {view.paused ? (
            <button className="btn btn-brass flex-1 !min-h-11 text-sm" onClick={() => api.host({ cmd: 'resume' })}>
              ▶ {fa.resume}
            </button>
          ) : (
            <button className="btn btn-ghost flex-1 !min-h-11 text-sm" onClick={() => api.host({ cmd: 'pause' })}>
              ⏸ {fa.pause}
            </button>
          )}
          <button className="btn btn-ghost flex-1 !min-h-11 text-sm" onClick={() => api.host({ cmd: 'skip' }).then((r) => !r.ok && void act)}>
            ⏭ {fa.skip}
          </button>
        </div>
      )}
      <PrivateStrip view={view} />
    </header>
  );
}

function PrivateStrip({ view }: { view: PlayerView }) {
  const me = view.me;
  const units = totalUnits(me.inventory);
  return (
    <div className="mx-auto mt-2 flex max-w-md items-center gap-3 rounded-xl bg-black/30 px-3 py-1.5">
      <Purse size={30} />
      <div className="leading-tight">
        <p className="text-xl font-black text-lantern">
          <AnimatedNumber value={me.cash} />
        </p>
        <p className="text-[11px] text-fog">
          {fa.reveal.wealth} <AnimatedNumber value={Math.round(me.wealth)} />
        </p>
      </div>
      <div className="ms-auto flex flex-col items-end gap-0.5">
        <Warehouse small inventory={me.inventory} goods={view.goods} />
        <span className="text-[11px] text-fog">
          {fa.orders.warehouse} {toFa(units, false)}/{toFa(CONFIG.warehouseCapacity, false)}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ info

function UnlockExplainers({ view }: { view: PlayerView }) {
  const queue = useMemo(() => {
    const q: ('claims' | 'trades' | 'contract' | 'auction')[] = [];
    if (view.round >= 1) q.push('claims');
    if (view.round >= 2) q.push('trades');
    if (view.announcedContract) q.push('contract');
    if (view.auctionContract) q.push('auction');
    return q;
  }, [view.round, view.announcedContract, view.auctionContract]);
  const [seen, setSeen] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      setSeen(JSON.parse(window.localStorage.getItem('wm:seen') ?? '[]'));
    } catch {
      setSeen([]);
    }
  }, []);
  if (!seen) return null;
  const next = queue.find((k) => !seen.includes(k));
  const mark = () => {
    const n = [...seen, next!];
    setSeen(n);
    try {
      window.localStorage.setItem('wm:seen', JSON.stringify(n));
    } catch {
      /* ignore */
    }
  };
  return (
    <AnimatePresence>
      {next && (
        <Modal onClose={mark} label={fa.unlock[next].title}>
          <div className="grid place-items-center gap-2 text-center">
            <WaxSeal size={60}>{next === 'trades' ? '⇄' : next === 'claims' ? '⚓' : '⚖'}</WaxSeal>
            <h3 className="text-xl font-black">{fa.unlock[next].title}</h3>
            <p className="leading-7 text-ink/85">{fa.unlock[next].body}</p>
            <button className="btn btn-wax mt-2 w-full" onClick={mark}>
              {fa.unlock.ok}
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}

function InfoPhase({ view }: { view: PlayerView }) {
  const me = view.me;
  return (
    <div className="grid gap-4">
      {view.storm && (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-xl border-2 border-wax bg-wax/20 p-4 text-center">
          <p className="text-3xl font-black text-waxlight">⛈ {fa.stormBanner}</p>
          <p className="mt-1 text-sm text-paper">{fa.stormDesc}</p>
        </motion.div>
      )}
      <GoodsRow goods={view.goods} prices={view.prices} />
      {view.news && <NewsCard news={view.news} />}
      {view.announcedContract && <ContractCard contract={view.announcedContract} auction={false} />}
      {view.auctionContract && <ContractCard contract={view.auctionContract} auction />}
      {me.clue && <ClueLetter clue={me.clue} storageKey={`wm:clue:${view.code}:${view.matchNumber}:${view.round}`} />}
      {me.ready ? <Waiting text={fa.waitOthers} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ claims

function ClaimsPanel({ view, act }: { view: PlayerView; act: Act }) {
  const names = nameMap(view.players);
  const [good, setGood] = useState<Good | null>(null);
  const hist = useMemo(() => {
    const by: Record<string, typeof view.claimHistory> = {};
    for (const e of view.claimHistory) (by[e.playerId] ??= []).push(e);
    return by;
  }, [view]);
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="mb-2 font-black text-lantern">📌 {fa.market.claimTitle}</h3>
        <p className="mb-2 text-xs text-fog">{fa.market.claimHint}</p>
        {view.claims.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/20 p-4 text-center text-fog">{fa.market.noClaims}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {view.claims.map((c) => (
              <ClaimNotice key={c.id} claim={c} name={names[c.playerId] ?? ''} />
            ))}
          </div>
        )}
      </div>
      <div className="glass p-3">
        <p className="mb-2 text-sm font-black">{fa.market.claimLeft(toFa(view.me.claimsLeft, false))}</p>
        <div className="grid grid-cols-5 gap-1.5">
          {view.goods.map((g) => (
            <button
              key={g}
              className={`plank relative grid min-h-14 place-items-center p-1 transition ${good && good !== g ? 'opacity-50' : ''}`}
              style={good === g ? { background: `linear-gradient(180deg, ${GOOD_COLOR[g]}, ${GOOD_COLOR[g]}99)`, boxShadow: `0 0 0 3px ${GOOD_COLOR[g]}, 0 0 18px ${GOOD_COLOR[g]}aa`, color: '#1b1206' } : undefined}
              onClick={() => setGood(g)}
              aria-pressed={good === g}
              aria-label={goodName(g)}
            >
              {good === g && <span className="absolute end-1 top-0.5 text-xs font-black" aria-hidden>✓</span>}
              <GoodIcon good={g} size={30} />
              <span className="text-[10px] font-black">{goodName(g)}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['up', 'down'] as const).map((d) => (
            <button key={d} className={`btn ${d === 'up' ? 'btn-brass' : 'btn-wax'} text-sm`} disabled={!good || view.me.claimsLeft <= 0} onClick={async () => { if (good && (await act({ type: 'claim', good, direction: d }))) { sfx.stamp(); buzz(25); setGood(null); } }}>
              {DIRECTION_ARROWS[d]} {d === 'up' ? fa.market.claimUp : fa.market.claimDown}
            </button>
          ))}
        </div>
      </div>
      {Object.keys(hist).length > 0 && (
        <div>
          <h3 className="mb-2 font-black text-lantern">{fa.market.history}</h3>
          <ul className="grid gap-1.5">
            {view.players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg bg-black/25 px-3 py-1.5">
                <span className="w-16 truncate text-sm font-black">{p.nickname}</span>
                <div className="flex flex-wrap gap-1">
                  {(hist[p.id] ?? []).map((e) => (
                    <span key={e.claimId} className={`rounded px-1.5 text-xs font-black ${e.net === 'true' ? 'bg-moss/30 text-mosslight' : e.net === 'mixed' ? 'bg-copper/30 text-lantern' : 'bg-wax/30 text-waxlight'}`} title={fa.reveal[e.net]}>
                      {goodName(e.good)} {DIRECTION_ARROWS[e.direction]} {e.net === 'true' ? '✓' : e.net === 'mixed' ? '~' : '✗'}
                    </span>
                  ))}
                  {!(hist[p.id] ?? []).length && <span className="text-xs text-fog">—</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ trades

function OfferRow({ o, names, mine, act }: { o: TradeOffer; names: Record<string, string>; mine: boolean; act: Act }) {
  return (
    <li className="paper p-3">
      <p className="text-sm font-black">{mine ? `${fa.market.to} ${names[o.to]}` : names[o.from]}</p>
      <p className="mt-1 text-sm">
        {fa.market.give}: <b>{bundleText(mine ? o.give : o.receive)}</b>
      </p>
      <p className="text-sm">
        {fa.market.receive}: <b>{bundleText(mine ? o.receive : o.give)}</b>
      </p>
      <div className="mt-2 flex gap-2">
        {mine ? (
          <button className="btn btn-ghost flex-1 !min-h-11 text-sm !text-ink" onClick={() => act({ type: 'cancelOffer', offerId: o.id })}>
            {fa.market.cancel}
          </button>
        ) : (
          <>
            <button className="btn btn-brass flex-1 !min-h-11 text-sm" onClick={async () => { if (await act({ type: 'respond', offerId: o.id, accept: true })) { sfx.coin(); buzz(30); } }}>
              {fa.market.accept}
            </button>
            <button className="btn btn-wax flex-1 !min-h-11 text-sm" onClick={() => act({ type: 'respond', offerId: o.id, accept: false })}>
              {fa.market.decline}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function TradePanel({ view, act }: { view: PlayerView; act: Act }) {
  const names = nameMap(view.players);
  const others = view.players.filter((p) => p.id !== view.me.id);
  const [to, setTo] = useState<string>('');
  const [give, setGive] = useState<Bundle>({ goods: {}, coins: 0 });
  const [recv, setRecv] = useState<Bundle>({ goods: {}, coins: 0 });
  const band = useMemo(() => checkTradeBand(give, recv, view.prices), [give, recv, view.prices]);
  if (!view.unlocks.trades) return <p className="glass p-6 text-center font-bold text-fog">🔒 {fa.market.tradeLocked}</p>;
  const empty = (b: Bundle) => b.coins <= 0 && Object.values(b.goods).every((v) => !v);
  return (
    <div className="grid gap-4">
      <p className="text-xs text-fog">{fa.market.directNote}</p>
      {view.me.offersIn.length > 0 && (
        <div>
          <h3 className="mb-2 font-black text-lantern">{fa.market.incoming}</h3>
          <ul className="grid gap-2">
            {view.me.offersIn.map((o) => (
              <OfferRow key={o.id} o={o} names={names} mine={false} act={act} />
            ))}
          </ul>
        </div>
      )}
      <div className="glass grid gap-3 p-3">
        <h3 className="font-black text-lantern">{fa.market.newOffer}</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={fa.market.to}>
          {others.map((p) => (
            <button key={p.id} role="radio" aria-checked={to === p.id} className={`btn !min-h-11 text-sm ${to === p.id ? 'btn-brass' : 'btn-ghost'}`} onClick={() => setTo(p.id)}>
              {p.nickname}
            </button>
          ))}
        </div>
        <BundleEditor goods={view.goods} value={give} onChange={setGive} label={fa.market.give} />
        <BundleEditor goods={view.goods} value={recv} onChange={setRecv} label={fa.market.receive} />
        <p className={`rounded-lg px-3 py-2 text-sm font-bold ${band.ok ? 'bg-moss/20 text-mosslight' : 'bg-white/5 text-fog'}`}>
          {band.coinRange ? `${fa.market.allowed}: ${toFa(band.coinRange.min)} – ${toFa(band.coinRange.max)} ${fa.market.coins}` : fa.market.bandMix} {band.ok && !empty(give) && !empty(recv) ? '✓' : ''}
        </p>
        <button className="btn btn-brass" disabled={!to || !band.ok || empty(give) || empty(recv)} onClick={async () => { if (await act({ type: 'propose', to, give, receive: recv })) { setGive({ goods: {}, coins: 0 }); setRecv({ goods: {}, coins: 0 }); sfx.coin(); } }}>
          {fa.market.send}
        </button>
      </div>
      <div>
        <h3 className="mb-2 font-black text-lantern">{fa.market.outgoing}</h3>
        {view.me.offersOut.length === 0 ? (
          <p className="text-sm text-fog">{fa.market.noOffers}</p>
        ) : (
          <ul className="grid gap-2">
            {view.me.offersOut.map((o) => (
              <OfferRow key={o.id} o={o} names={names} mine act={act} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ clue market

function CluePanel({ view, act }: { view: PlayerView; act: Act }) {
  const me = view.me;
  const names = nameMap(view.players);
  const [price, setPrice] = useState(40);
  if (!view.unlocks.trades)
    return (
      <div className="grid gap-4">
        {me.clue && <ClueCardView clue={me.clue} />}
        <p className="glass p-6 text-center font-bold text-fog">🔒 {fa.market.cluesLocked}</p>
      </div>
    );
  const others = view.cards.filter((c) => c.sellerId !== me.id);
  return (
    <div className="grid gap-4">
      {me.clue && (
        <div className="grid gap-2">
          <ClueCardView clue={me.clue} />
          <div className="glass grid gap-2 p-3">
            <p className="font-black">{fa.market.myCard}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">
                {fa.market.price} · <span className="text-xs text-fog">{fa.market.cap}</span>
              </span>
              <Stepper value={me.myCard?.price ?? price} min={1} max={CONFIG.clueCardMaxPrice} step={10} label={fa.market.price} onChange={(v) => { setPrice(v); if (me.myCard) void act({ type: 'listCard', price: v }); }} />
            </div>
            {me.myCard ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-mosslight">{fa.market.soldN(toFa(me.myCard.soldCount, false))}</span>
                {me.myCard.soldCount === 0 && (
                  <button className="btn btn-ghost !min-h-11 text-sm" onClick={() => act({ type: 'unlistCard' })}>
                    {fa.market.unlist}
                  </button>
                )}
              </div>
            ) : (
              <button className="btn btn-brass" onClick={async () => { if (await act({ type: 'listCard', price })) sfx.stamp(); }}>
                {fa.market.listCard}
              </button>
            )}
          </div>
        </div>
      )}
      <div>
        <h3 className="mb-2 font-black text-lantern">✉ {fa.market.clues}</h3>
        {others.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/20 p-4 text-center text-fog">{fa.market.noCards}</p>
        ) : (
          <ul className="grid gap-2">
            {others.map((c) => {
              const owned = me.boughtFrom.includes(c.sellerId);
              return (
                <li key={c.sellerId} className="paper p-3">
                  <div className="flex items-center gap-3">
                    <WaxSeal size={38}>؟</WaxSeal>
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{names[c.sellerId]}</p>
                      <p className="text-xs text-ink/75">{describePreview(c.preview, c.isCount)}</p>
                      <p className="text-xs font-bold text-copper">{fa.market.soldN(toFa(c.soldCount, false))}</p>
                    </div>
                    <button className="btn btn-brass !min-h-11 text-sm" disabled={owned || me.cash < c.price} onClick={async () => { if (await act({ type: 'buyCard', sellerId: c.sellerId })) { sfx.coin(); buzz(30); } }}>
                      {owned ? fa.market.bought : `${fa.market.buy} · ${toFa(c.price)}`}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {me.purchases.length > 0 && (
        <div>
          <h3 className="mb-2 font-black text-lantern">{fa.market.buyersClues}</h3>
          <ul className="grid gap-2">
            {me.purchases.map((p) => (
              <li key={p.id}>
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <ClueCardView clue={p.clue} verifiedFrom={p.sellerName} />
                </motion.div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ chat

function ChatPanel({ state, api, view, onlySpeaker }: { state: RoomState; api: RoomApi; view: PlayerView; onlySpeaker?: boolean }) {
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const { push, node } = useToasts();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'nearest' }), [state.chat.length]);
  const names = nameMap(view.players);
  const iAmSpeaker = view.speaker?.currentId === view.me.id;
  const blocked = onlySpeaker && !iAmSpeaker;
  return (
    <div className="grid gap-2">
      {node}
      <ul className="glass max-h-56 min-h-24 overflow-y-auto p-3 text-sm">
        {state.chat.length === 0 && <li className="text-fog">…</li>}
        {state.chat.map((m) => (
          <li key={m.id} className="mb-1">
            <b className={m.to ? 'text-lantern' : 'text-paper'}>
              {m.fromName}
              {m.to ? ` ⇢ ${names[m.to] ?? ''}` : ''}:
            </b>{' '}
            {m.text}
          </li>
        ))}
        <div ref={endRef} />
      </ul>
      {state.settings.whisperAllowed && (
        <select className="input !min-h-11" value={to} onChange={(e) => setTo(e.target.value)} aria-label={fa.market.to}>
          <option value="">{fa.market.chat} · همه</option>
          {view.players.filter((p) => p.id !== view.me.id).map((p) => (
            <option key={p.id} value={p.id}>
              🤫 {p.nickname}
            </option>
          ))}
        </select>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const r = await api.chat(text, to || undefined);
          if (!r.ok) push(errorText(r.error));
          else setText('');
        }}
      >
        <input className="input" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} disabled={blocked} placeholder={onlySpeaker ? fa.tribune.chatOnce : fa.market.chat} />
        <button className="btn btn-brass shrink-0" disabled={blocked}>
          {fa.common.send}
        </button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ phases

function TribunePhase({ view, state, api, act }: { view: PlayerView; state: RoomState; api: RoomApi; act: Act }) {
  const sp = view.speaker;
  const names = nameMap(view.players);
  const mine = sp?.currentId === view.me.id;
  useEffect(() => {
    if (mine) {
      sfx.turn();
      buzz([60, 50, 60]);
    }
  }, [mine]);
  const { left } = useCountdown(view.deadline, view.paused, view.pausedRemainingMs, api.now);
  const upcoming = sp ? sp.order.slice(sp.index + 1) : [];
  return (
    <div className="grid gap-4">
      <motion.div key={sp?.currentId ?? 'none'} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative overflow-hidden rounded-2xl border border-lantern/40 px-4 py-8 text-center" style={{ background: 'radial-gradient(120% 90% at 50% 0%, rgba(244,178,74,.35), rgba(10,19,34,.2) 60%)' }}>
        {mine ? (
          <>
            <p className="text-4xl font-black text-lantern">{fa.tribune.yourTurn}</p>
            <p className="mt-1 text-paper">{fa.tribune.yourTurnDesc}</p>
            <p className="my-3 text-7xl font-black tabular-nums">{toFa(left, false)}</p>
            <button className="btn btn-brass" onClick={() => act({ type: 'endTurn' })}>
              {fa.tribune.done}
            </button>
          </>
        ) : sp?.currentId ? (
          <>
            <Lantern size={46} />
            <p className="mt-2 text-sm font-bold text-fog">{fa.tribune.speaking}</p>
            <p className="text-4xl font-black text-lantern">{names[sp.currentId]}</p>
            <p className="mt-2 text-5xl font-black tabular-nums">{toFa(left, false)}</p>
          </>
        ) : (
          <p className="font-bold text-fog">{fa.tribune.noSpeakers}</p>
        )}
      </motion.div>
      {upcoming.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold text-fog">{fa.tribune.queue}</p>
          <ul className="flex flex-wrap gap-2">
            {upcoming.map((id) => (
              <li key={id} className="glass flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold">
                <Lantern size={14} glow={false} /> {names[id]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {state.settings.chatEnabled && <ChatPanel state={state} api={api} view={view} onlySpeaker />}
      <details className="glass p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-black">📌 {fa.market.claims}</summary>
        <div className="mt-3">
          <ClaimsPanel view={view} act={act} />
        </div>
      </details>
    </div>
  );
}

type Tab = 'trade' | 'clues' | 'claims' | 'chat';

function MarketPhase({ view, state, api, act }: { view: PlayerView; state: RoomState; api: RoomApi; act: Act }) {
  const [tab, setTab] = useState<Tab>('claims');
  const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'trade', label: fa.market.trade, icon: '⇄', badge: view.me.offersIn.length },
    { id: 'clues', label: fa.market.clues, icon: '✉' },
    { id: 'claims', label: fa.market.claims, icon: '📌', badge: view.claims.length },
    ...(state.settings.chatEnabled ? [{ id: 'chat' as Tab, label: fa.market.chat, icon: '💬' }] : []),
  ];
  return (
    <>
      <div className="mb-3">
        <GoodsRow goods={view.goods} prices={view.prices} />
      </div>
      {tab === 'trade' && <TradePanel view={view} act={act} />}
      {tab === 'clues' && <CluePanel view={view} act={act} />}
      {tab === 'claims' && <ClaimsPanel view={view} act={act} />}
      {tab === 'chat' && <ChatPanel state={state} api={api} view={view} />}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-brass/30 bg-night/95 backdrop-blur" aria-label="market">
        <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((t) => (
            <li key={t.id}>
              <button className={`relative flex min-h-14 w-full flex-col items-center justify-center text-xs font-black ${tab === t.id ? 'text-lantern' : 'text-fog'}`} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
                <span className="text-xl" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
                {!!t.badge && <span className="absolute end-1/4 top-1 grid size-5 place-items-center rounded-full bg-wax text-[11px] text-white">{toFa(t.badge, false)}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function OrdersPhase({ view, act }: { view: PlayerView; act: Act }) {
  const me = view.me;
  const key = `${view.matchNumber}:${view.round}`;
  const [draft, setDraft] = useState<Partial<Record<Good, number>>>(me.orders.orders);
  const [bid, setBid] = useState<number>(me.orders.bid ?? 0);
  const [stamped, setStamped] = useState(false);
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setDraft(me.orders.orders);
      setBid(me.orders.bid ?? 0);
      setStamped(false);
    }
  }, [key, me.orders]);
  const sealed = me.orders.sealed || stamped;
  // push drafts so a timeout never loses them
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (sealed) return;
    const t = setTimeout(() => void act({ type: 'orders', orders: draft, bid: bid || null, seal: false }), 500);
    return () => clearTimeout(t);
  }, [draft, bid, sealed, act]);

  const units = totalUnits(me.inventory);
  let projUnits = units;
  let estCost = 0;
  const proj = { ...me.inventory };
  for (const g of view.goods) {
    const q = draft[g] ?? 0;
    proj[g] = Math.max(0, proj[g] + q);
    projUnits += q;
    estCost += q * view.prices[g];
  }
  const over = projUnits > CONFIG.warehouseCapacity;
  const c = view.auctionContract;

  if (sealed)
    return (
      <div className="grid place-items-center gap-4 py-10 text-center">
        <motion.div initial={{ scale: 2.5, rotate: -25, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
          <WaxSeal size={110}>✓</WaxSeal>
        </motion.div>
        <p className="text-2xl font-black text-lantern">{fa.orders.sealed}</p>
        <Waiting text={fa.orders.sealedDesc} />
      </div>
    );

  return (
    <div className="grid gap-4 pb-28">
      <div>
        <h2 className="text-xl font-black brass-text">{fa.orders.title}</h2>
        <p className="text-sm text-fog">{fa.orders.desc}</p>
      </div>
      <ul className="grid gap-3">
        {view.goods.map((g) => {
          const q = draft[g] ?? 0;
          const r = estimateRange(view.prices[g], q);
          return (
            <li key={g} className={`plank p-3 ${q > 0 ? 'ring-2 ring-mosslight/70' : q < 0 ? 'ring-2 ring-waxlight/70' : ''}`}>
              <div className="flex items-center gap-3">
                <GoodIcon good={g} size={48} />
                <div className="flex-1">
                  <p className="font-black">{goodName(g)}</p>
                  <p className="text-xs text-paper/80">
                    {fa.orders.hold} {toFa(me.inventory[g], false)}
                  </p>
                </div>
                <PriceTag price={view.prices[g]} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="min-w-24 text-sm font-black">{q > 0 ? <Trend dir="up" label={`${fa.orders.buy} ${toFa(q, false)}`} /> : q < 0 ? <Trend dir="down" label={`${fa.orders.sell} ${toFa(-q, false)}`} /> : <span className="text-fog">{fa.orders.none}</span>}</div>
                <Stepper value={q} min={-me.inventory[g]} max={Math.max(q, q + CONFIG.warehouseCapacity - projUnits)} label={goodName(g)} onChange={(v) => setDraft((d) => ({ ...d, [g]: v }))} format={(v) => (v === 0 ? '·' : toFa(Math.abs(v), false))} />
              </div>
              {q !== 0 && (
                <p className="mt-1 text-xs text-paper/75">
                  {fa.orders.range}: {toFa(r.low)} – {toFa(r.high)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {c && (
        <div className="paper p-4">
          <div className="flex items-center gap-2">
            <GoodIcon good={c.good} size={40} />
            <div>
              <p className="font-black">{fa.orders.bid}</p>
              <p className="text-xs text-ink/75">{fa.orders.bidDesc}</p>
            </div>
          </div>
          <p className="mt-2 text-sm font-bold">
            {toFa(c.quantity)} {goodName(c.good)} × {toFa(c.unitPrice)} = {toFa(c.quantity * c.unitPrice)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Stepper value={bid} min={0} max={me.cash} step={10} label={fa.orders.bid} onChange={setBid} format={(v) => (v === 0 ? fa.orders.noBid : toFa(v))} />
            <button className="btn btn-ghost !min-h-11 text-xs !text-ink" onClick={() => setBid(Math.min(me.cash, Math.round(c.quantity * (c.unitPrice - view.prices[c.good]) * 0.5)))}>
              ½ {fa.reveal.wealth}
            </button>
          </div>
        </div>
      )}
      <div className="glass grid gap-2 p-3">
        <Warehouse inventory={proj} goods={view.goods} />
        <p className={`text-sm font-bold ${over ? 'text-waxlight' : 'text-fog'}`}>
          {over ? `⚠ ${fa.orders.full}` : `${fa.orders.warehouse} ${toFa(Math.min(projUnits, 99), false)}/${toFa(CONFIG.warehouseCapacity, false)}`} · {fa.orders.estCost}: <span dir="ltr">{(estCost >= 0 ? '−' : '+') + toFa(Math.abs(estCost))}</span>
        </p>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brass/30 bg-night/95 p-3 backdrop-blur">
        <button
          className="btn btn-wax mx-auto flex w-full max-w-md !min-h-14 text-lg"
          onClick={async () => {
            setStamped(true);
            const ok = await act({ type: 'orders', orders: draft, bid: bid || null, seal: true });
            if (ok) {
              sfx.stamp();
              buzz([40, 30, 80]);
            } else setStamped(false);
          }}
        >
          🔏 {fa.orders.seal}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ root

export function PlayerGame({ state, api }: { state: RoomState; api: RoomApi }) {
  const view = state.game as PlayerView;
  const { push, node } = useToasts();
  const names = useMemo(() => nameMap(view.players), [view.players]);
  const { left, total } = useCountdown(view.deadline, view.paused, view.pausedRemainingMs, api.now);
  const apiAct = api.act;
  const act: Act = useCallback(
    async (a) => {
      const r = await apiAct(a);
      if (!r.ok) {
        push(errorText(r.error));
        sfx.bad();
      }
      return r.ok;
    },
    [apiAct, push],
  );
  const isHost = state.you === state.hostId;

  if (view.phase === 'final' && view.final) {
    return (
      <main className="mx-auto max-w-md">
        {node}
        <div className="flex justify-end p-3">
          <MuteButton />
        </div>
        <FinalStage view={view.final} names={names} you={view.me.id} isHost={isHost} onAgain={() => void api.host({ cmd: 'restart' })} onNext={() => void api.host({ cmd: 'skip' })} />
      </main>
    );
  }

  return (
    <div className="min-h-dvh pb-24">
      {node}
      <TopBar view={view} state={state} api={api} act={act} left={left} total={total} onReady={() => void act({ type: 'ready' })} />
      {view.paused && <p className="bg-lantern px-3 py-1 text-center text-sm font-black text-ink">⏸ {fa.paused}</p>}
      <main className="mx-auto max-w-md px-4 pt-4">
        {view.phase === 'info' && <InfoPhase view={view} />}
        {view.phase === 'tribune' && <TribunePhase view={view} state={state} api={api} act={act} />}
        {view.phase === 'market' && <MarketPhase view={view} state={state} api={api} act={act} />}
        {view.phase === 'orders' && <OrdersPhase view={view} act={act} />}
        {view.phase === 'reveal' && (
          <>
            <RevealStage view={view} names={names} privateResult={view.me.privateResult} />
            {isHost && (
              <button className="btn btn-ghost mt-5 w-full text-sm" onClick={() => void api.host({ cmd: 'skip' })}>
                {fa.reveal.next} ›
              </button>
            )}
          </>
        )}
      </main>
      {view.phase === 'info' && <UnlockExplainers view={view} />}
    </div>
  );
}
