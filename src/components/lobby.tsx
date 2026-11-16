'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CONFIG } from '../engine/config';
import { toFa } from '../engine/describe';
import { fa, errorText } from '../i18n/fa';
import type { RoomState } from '../lib/protocol';
import type { RoomApi } from '../lib/useRoom';
import { Lantern } from './art';
import { MuteButton, useToasts } from './ui';

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-black/20 px-3 text-start disabled:opacity-60">
      <span className="text-sm font-bold">{label}</span>
      <span className={`flex h-7 w-12 items-center rounded-full p-1 transition ${on ? 'bg-moss' : 'bg-white/15'}`}>
        <span className={`size-5 rounded-full bg-white transition ${on ? '-translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

function Num({ label, value, min, max, step = 1, onChange, disabled }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-black/20 px-3">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost !min-h-11 !w-11 !px-0 text-xl" disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="−">
          −
        </button>
        <span className="w-10 text-center text-lg font-black tabular-nums">{toFa(value, false)}</span>
        <button className="btn btn-ghost !min-h-11 !w-11 !px-0 text-xl" disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="+">
          +
        </button>
      </div>
    </div>
  );
}

export function RuleBanner({ whisper }: { whisper: boolean }) {
  return (
    <p className={`rounded-xl border px-3 py-2 text-center text-sm font-extrabold ${whisper ? 'border-lantern/50 bg-lantern/10 text-lantern' : 'border-fog/40 bg-white/5 text-paper'}`}>
      {whisper ? '🤫 ' + fa.lobby.ruleWhisper : '📣 ' + fa.lobby.ruleNoWhisper}
    </p>
  );
}

export function PlayerLanterns({ state, big = false }: { state: RoomState; big?: boolean }) {
  return (
    <ul className={`grid gap-3 ${big ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {state.lobbyPlayers.map((p, i) => (
        <motion.li key={p.id} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.05 }} className={`glass flex items-center gap-3 p-3 ${big ? 'text-2xl' : ''} ${p.connected ? '' : 'opacity-50'}`}>
          <Lantern size={big ? 34 : 24} glow={p.connected} />
          <div className="min-w-0">
            <p className="truncate font-black">{p.nickname}</p>
            <p className="text-xs text-fog">
              {p.isHost ? fa.lobby.host : p.isBot ? fa.lobby.bot : p.connected ? '' : fa.lobby.offline}
              {p.id === state.you ? ` · ${fa.common.you}` : ''}
            </p>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

export function Lobby({ state, api }: { state: RoomState; api: RoomApi }) {
  const isHost = state.you === state.hostId;
  const s = state.settings;
  const { push, node } = useToasts();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    if (!r.ok) push(errorText(r.error));
  };
  const n = state.lobbyPlayers.length;
  const set = (patch: Partial<typeof s>) => run(api.host({ cmd: 'settings', settings: patch }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-10 pt-5">
      {node}
      <div className="flex items-center justify-between">
        <h1 className="brass-text text-2xl font-black">{fa.lobby.title}</h1>
        <MuteButton />
      </div>

      <section className="paper p-4 text-center">
        <p className="text-sm font-bold text-ink/70">{fa.lobby.code}</p>
        <p className="text-6xl font-black tracking-[0.3em]" dir="ltr">
          {state.code}
        </p>
        <p className="mt-1 text-sm text-ink/70">{fa.lobby.share}</p>
        {origin && (
          <p className="mt-2 break-all text-xs text-ink/60" dir="ltr">
            {origin}/?code={state.code}
          </p>
        )}
      </section>

      <RuleBanner whisper={s.whisperAllowed} />
      <PlayerLanterns state={state} />

      {isHost && (
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1 text-sm" onClick={() => run(api.host({ cmd: 'addBot' }))} disabled={n >= CONFIG.maxPlayers}>
            + {fa.lobby.addBot}
          </button>
        </div>
      )}
      {isHost && (
        <ul className="grid gap-2">
          {state.lobbyPlayers
            .filter((p) => p.id !== state.you)
            .map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-1">
                <span className="font-bold">{p.nickname}</span>
                <button className="btn btn-ghost !min-h-11 text-xs" onClick={() => run(p.isBot ? api.host({ cmd: 'removeBot', id: p.id }) : api.host({ cmd: 'kick', id: p.id }))}>
                  {p.isBot ? fa.lobby.removeBot : fa.lobby.kick}
                </button>
              </li>
            ))}
        </ul>
      )}

      <section className="glass grid gap-3 p-4">
        <h2 className="font-black text-paper">{fa.lobby.preset}</h2>
        <div className="grid grid-cols-2 gap-2">
          {(['open', 'busy'] as const).map((p) => (
            <button key={p} disabled={!isHost} onClick={() => run(api.host({ cmd: 'preset', preset: p }))} className={`rounded-xl border p-3 text-start transition ${s.preset === p ? 'border-lantern bg-lantern/15' : 'border-white/15 bg-black/20'} disabled:cursor-default`} aria-pressed={s.preset === p}>
              <p className="font-black">{p === 'open' ? fa.lobby.open : fa.lobby.busy}</p>
              <p className="mt-1 text-xs text-fog">{p === 'open' ? fa.lobby.openDesc : fa.lobby.busyDesc}</p>
            </button>
          ))}
        </div>
        <details className="group">
          <summary className="btn btn-ghost w-full cursor-pointer text-sm">{fa.lobby.advanced}</summary>
          <div className="mt-3 grid gap-2">
            <Num label={fa.lobby.warehouse} value={s.warehouseCapacity} min={CONFIG.warehouseMin} max={CONFIG.warehouseMax} step={2} onChange={(v) => set({ warehouseCapacity: v })} disabled={!isHost} />
            <Num label={fa.lobby.rounds} value={s.rounds} min={CONFIG.rounds.min} max={CONFIG.rounds.max} onChange={(v) => set({ rounds: v })} disabled={!isHost} />
            <Num label={fa.lobby.tribune} value={s.tribuneSeconds} min={10} max={90} step={5} onChange={(v) => set({ tribuneSeconds: v })} disabled={!isHost} />
            <Num label={fa.lobby.market} value={s.marketSeconds} min={30} max={600} step={15} onChange={(v) => set({ marketSeconds: v })} disabled={!isHost} />
            <Num label={fa.lobby.orders} value={s.orderSeconds} min={15} max={120} step={5} onChange={(v) => set({ orderSeconds: v })} disabled={!isHost} />
            <Toggle on={s.whisperAllowed} onChange={(v) => set({ whisperAllowed: v })} label={fa.lobby.whisper} disabled={!isHost} />
            <Toggle on={s.chatEnabled} onChange={(v) => set({ chatEnabled: v })} label={fa.lobby.chat} disabled={!isHost} />
          </div>
        </details>
      </section>

      <section className="rounded-xl border border-brass/25 bg-black/20 p-3 text-center text-sm">
        <p className="font-bold text-paper">{fa.lobby.tvTip}</p>
        <p className="mt-1 break-all text-fog" dir="ltr">
          {origin}/tv/{state.code}
        </p>
      </section>

      {isHost ? (
        <button className="btn btn-brass w-full text-lg" disabled={n < CONFIG.minPlayers} onClick={() => run(api.host({ cmd: 'start' }))}>
          {n < CONFIG.minPlayers ? fa.lobby.need : fa.lobby.start}
        </button>
      ) : (
        <p className="py-3 text-center font-bold text-fog">{fa.lobby.waitingHost}</p>
      )}
      <button className="btn btn-ghost text-sm" onClick={() => api.leave().then(() => (window.location.href = '/'))}>
        {fa.lobby.leave}
      </button>
    </main>
  );
}
