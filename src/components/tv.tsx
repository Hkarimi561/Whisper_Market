'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { goodName, toFa } from '../engine/describe';
import type { PublicView } from '../engine/views';
import { fa } from '../i18n/fa';
import type { RoomState } from '../lib/protocol';
import { useCountdown, type RoomApi } from '../lib/useRoom';
import { Fuse, GoodIcon, Lantern, fmtTime } from './art';
import { FinalStage } from './final';
import { PlayerLanterns, RuleBanner } from './lobby';
import { RevealStage } from './reveal';
import { ClaimNotice, ContractCard, NewsCard, PriceTag, nameMap } from './shared';
import { MuteButton } from './ui';

function Board({ view }: { view: PublicView }) {
  return (
    <ul className="grid gap-4" style={{ gridTemplateColumns: `repeat(${view.goods.length}, minmax(0,1fr))` }}>
      {view.goods.map((g) => (
        <li key={g} className="plank flex flex-col items-center gap-2 p-4">
          <GoodIcon good={g} size={96} />
          <p className="text-3xl font-black">{goodName(g)}</p>
          <PriceTag price={view.prices[g]} size="lg" />
        </li>
      ))}
    </ul>
  );
}

function Status({ view }: { view: PublicView }) {
  return (
    <ul className="flex flex-wrap justify-center gap-4">
      {view.players.map((p) => (
        <li key={p.id} className={`glass flex items-center gap-3 px-5 py-3 text-3xl font-black ${p.ready ? 'ring-2 ring-mosslight' : ''} ${p.connected ? '' : 'opacity-40'}`}>
          <Lantern size={28} glow={p.ready} />
          {p.nickname}
          {p.ready && <span className="text-mosslight">✓</span>}
        </li>
      ))}
    </ul>
  );
}

export function TvGame({ state, api }: { state: RoomState; api: RoomApi }) {
  const view = state.game as PublicView;
  const names = nameMap(view.players);
  const { left, total } = useCountdown(view.deadline, view.paused, view.pausedRemainingMs, api.now);
  const hasTimer = view.deadline !== null || view.paused;

  if (view.phase === 'final' && view.final) {
    return (
      <main className="min-h-dvh">
        <div className="fixed end-4 top-4">
          <MuteButton />
        </div>
        <FinalStage tv view={view.final} names={names} isHost={false} onAgain={() => undefined} onNext={() => undefined} />
      </main>
    );
  }
  const sp = view.speaker;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-6 border-b border-brass/30 bg-night/70 px-10 py-4">
        <div>
          <p className="text-2xl font-bold text-fog">
            {fa.round(toFa(view.round, false), toFa(view.totalRounds, false))} {view.storm && <span className="rounded bg-wax px-3 py-1 font-black text-white">⛈ {fa.storm}</span>}
          </p>
          <p className="brass-text text-6xl font-black leading-tight">{fa.phase[view.phase]}</p>
        </div>
        <div className="flex-1">{hasTimer && <Fuse left={left} total={total} paused={view.paused} className="!h-10" tick={false} />}</div>
        {hasTimer && <span className={`min-w-40 rounded-2xl bg-black/40 px-5 py-2 text-center text-7xl font-black tabular-nums ${left <= 5 && !view.paused ? 'text-waxlight pulse-soft' : ''}`}>{fmtTime(left)}</span>}
        <MuteButton />
      </header>
      {view.paused && <p className="bg-lantern py-2 text-center text-3xl font-black text-ink">⏸ {fa.paused}</p>}

      <main className="flex flex-1 flex-col justify-center gap-8 px-10 py-8">
        {view.phase === 'info' && (
          <div className="grid gap-8">
            {view.storm && (
              <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl border-4 border-wax bg-wax/25 p-8 text-center">
                <p className="text-7xl font-black text-waxlight">⛈ {fa.stormBanner}</p>
                <p className="mt-2 text-3xl text-paper">{fa.stormDesc}</p>
              </motion.div>
            )}
            <Board view={view} />
            <div className="grid grid-cols-2 gap-8">
              {view.news && (
                <NewsCard big news={view.news} />
              )}
              {view.announcedContract && <ContractCard big contract={view.announcedContract} auction={false} />}
              {view.auctionContract && <ContractCard big contract={view.auctionContract} auction />}
            </div>
            <p className="text-center text-3xl font-bold text-fog">✉ {fa.info.yourClue}…</p>
          </div>
        )}

        {view.phase === 'tribune' && (
          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-2 grid place-items-center rounded-3xl border-2 border-lantern/40 py-16 text-center" style={{ background: 'radial-gradient(100% 90% at 50% 0%, rgba(244,178,74,.4), rgba(10,19,34,.1) 65%)' }}>
              <Lantern size={90} />
              <p className="mt-4 text-3xl font-bold text-fog">{fa.tribune.speaking}</p>
              <motion.p key={sp?.currentId} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[9rem] font-black leading-none text-lantern">
                {sp?.currentId ? names[sp.currentId] : fa.tribune.noSpeakers}
              </motion.p>
              {sp && sp.index >= 0 && sp.order.length > sp.index + 1 && (
                <div className="mt-8 flex gap-4">
                  {sp.order.slice(sp.index + 1).map((id) => (
                    <span key={id} className="glass flex items-center gap-2 px-5 py-2 text-3xl font-black">
                      <Lantern size={20} glow={false} /> {names[id]}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ClaimWall view={view} names={names} />
          </div>
        )}

        {view.phase === 'market' && (
          <div className="grid grid-cols-5 gap-8">
            <div className="col-span-3 grid gap-8">
              <Board view={view} />
              {view.cards.length > 0 && (
                <div>
                  <p className="mb-2 text-3xl font-black text-lantern">✉ {fa.market.clues}</p>
                  <ul className="flex flex-wrap gap-4">
                    {view.cards.map((c) => (
                      <li key={c.sellerId} className="paper px-5 py-3 text-2xl font-black">
                        {names[c.sellerId]} · {toFa(c.price)} <span className="text-lg font-bold text-copper">({fa.market.soldN(toFa(c.soldCount, false))})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="col-span-2">
              <ClaimWall view={view} names={names} />
            </div>
          </div>
        )}

        {view.phase === 'orders' && (
          <div className="grid gap-10 text-center">
            <div className="grid place-items-center gap-3">
              <p className="text-6xl font-black text-lantern">{fa.orders.title}</p>
              <p className="text-3xl text-fog">{fa.orders.desc}</p>
            </div>
            {view.auctionContract && <div className="mx-auto max-w-3xl"><ContractCard big contract={view.auctionContract} auction /></div>}
            <Status view={view} />
          </div>
        )}

        {view.phase === 'reveal' && <RevealStage tv view={view} names={names} />}
      </main>
      <TvFooter view={view} />
    </div>
  );
}

function ClaimWall({ view, names }: { view: PublicView; names: Record<string, string> }) {
  return (
    <div>
      <p className="mb-3 text-4xl font-black text-lantern">📌 {fa.market.claimTitle}</p>
      {view.claims.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-white/20 p-8 text-center text-3xl text-fog">{fa.market.noClaims}</p>
      ) : (
        <div className="grid gap-4">
          {view.claims.map((c) => (
            <ClaimNotice big key={c.id} claim={c} name={names[c.playerId] ?? ''} />
          ))}
        </div>
      )}
    </div>
  );
}

function TvFooter({ view }: { view: PublicView }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.host), []);
  return (
    <footer className="flex items-center justify-between border-t border-brass/20 px-10 py-3 text-2xl text-fog">
      <span dir="ltr">
        {origin} · <b className="text-paper">{view.code}</b>
      </span>
      <span>{view.settings.whisperAllowed ? '🤫 ' + fa.lobby.ruleWhisper : '📣 ' + fa.lobby.ruleNoWhisper}</span>
    </footer>
  );
}

export function TvLobby({ state }: { state: RoomState }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.host), []);
  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl content-center gap-10 px-10 py-10 text-center">
      <div>
        <p className="brass-text text-8xl font-black">{fa.appName}</p>
        <p className="mt-2 text-3xl text-fog">{fa.tagline}</p>
      </div>
      <div className="paper mx-auto px-16 py-8">
        <p className="text-3xl font-bold text-ink/70">{fa.lobby.code}</p>
        <p className="text-[10rem] font-black leading-none tracking-[0.3em]" dir="ltr">
          {state.code}
        </p>
        <p className="mt-2 text-3xl font-bold text-ink/70" dir="ltr">
          {origin}
        </p>
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <RuleBanner whisper={state.settings.whisperAllowed} />
      </div>
      <PlayerLanterns state={state} big />
      <p className="text-3xl font-bold text-fog">{fa.lobby.waitingHost}</p>
    </main>
  );
}
