'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GoodIcon, Lantern } from '../components/art';
import { GoogleLogin, useGoogleClientId, type GoogleUser } from '../components/google-login';
import { MuteButton } from '../components/ui';
import { fa, errorText } from '../i18n/fa';
import { emitAck, oneShot, saveToken } from '../lib/useRoom';
import { GOODS } from '../engine/config';

function Skyline() {
  return (
    <svg viewBox="0 0 800 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-60" aria-hidden>
      <path d="M0 120V84h40V70h24v14h30V60l16-14 16 14v24h40V76h28V50h10V36h4v14h10v26h46V88h36V64l20-18 20 18v24h50V78h30V58h24v20h40V90h60V70l24-20 24 20v20h46V82h40V60h20v22h50V92h60V72h30V56l18-12 18 12v36h60V84h50V68h24v16h40v36z" fill="#0b162b" />
      <path d="M520 84l60-6 6 8h-72z" fill="#16264a" />
      <path d="M552 78V30l36 44z" fill="#1b2e55" />
    </svg>
  );
}

export default function Landing() {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [nick, setNick] = useState('');
  const [code, setCode] = useState('');
  const [tvCode, setTvCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const googleId = useGoogleClientId();
  const [gUser, setGUser] = useState<GoogleUser | null>(null);
  useEffect(() => {
    if (gUser?.name) setNick((n) => n || gUser.name);
  }, [gUser]);

  useEffect(() => {
    try {
      const c = window.localStorage.getItem('wm:lastRoom');
      if (c && window.localStorage.getItem(`wm:token:${c}`)) setLast(c);
      const n = window.localStorage.getItem('wm:nick');
      if (n) setNick(n);
      const q = new URLSearchParams(window.location.search).get('code');
      if (q) {
        setCode(q.toUpperCase().slice(0, 4));
        setTab('join');
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  async function go() {
    setErr('');
    const name = nick.trim() || gUser?.name || '';
    if (!name) return setErr(errorText('bad-nickname'));
    if (tab === 'join' && code.trim().length !== 4) return setErr(errorText('no-room'));
    setBusy(true);
    try {
      const res = await oneShot(async (s) =>
        tab === 'create'
          ? emitAck<{ code: string; token: string; playerId: string }>(s, 'room:create', { nickname: name, credential: gUser?.credential })
          : emitAck<{ code: string; token: string; playerId: string }>(s, 'room:join', { code: code.trim().toUpperCase(), nickname: name, credential: gUser?.credential }),
      );
      if (!res.ok) {
        setErr(errorText(res.error));
        setBusy(false);
        return;
      }
      saveToken(res.code, res.token);
      try {
        window.localStorage.setItem('wm:nick', name);
      } catch {
        /* ignore */
      }
      router.push(`/room/${res.code}`);
    } catch {
      setErr(errorText('disconnected'));
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28 pt-6">
      <div className="flex items-center justify-between">
        <Link href="/how-to-play" className="btn btn-ghost !min-h-11 text-sm">
          {fa.landing.how}
        </Link>
        <MuteButton />
      </div>

      <header className="relative mt-4 text-center">
        <div className="absolute start-6 top-0 opacity-90">
          <Lantern size={46} />
        </div>
        <div className="absolute end-6 top-0 opacity-70">
          <Lantern size={34} />
        </div>
        <p className="text-xs font-bold tracking-[0.35em] text-brass">WHISPER MARKET</p>
        <h1 className="brass-text mt-2 text-7xl font-black leading-tight drop-shadow-[0_4px_18px_rgba(244,178,74,0.35)]">{fa.appName}</h1>
        <p className="mx-auto mt-2 max-w-xs text-base font-semibold text-paper/90">{fa.tagline}</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-fog">{fa.taglineSub}</p>
      </header>

      <div className="mt-5 flex justify-center gap-2" aria-hidden>
        {GOODS.map((g, i) => (
          <motion.div key={g} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 * i }} className="plank grid size-12 place-items-center">
            <GoodIcon good={g} size={34} />
          </motion.div>
        ))}
      </div>

      <section className="glass mt-6 p-4">
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-black/25 p-1" role="tablist">
          {(['create', 'join'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`btn !min-h-11 text-sm ${tab === t ? 'btn-brass' : 'text-fog'}`}>
              {t === 'create' ? fa.landing.create : fa.landing.join}
            </button>
          ))}
        </div>
        {googleId && <GoogleLogin clientId={googleId} user={gUser} onUser={setGUser} />}
        <label className="mb-1 block text-sm font-bold text-paper" htmlFor="nick">
          {fa.landing.nickname}
        </label>
        <input id="nick" className="input" value={nick} maxLength={14} placeholder={fa.landing.nicknamePh} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
        {tab === 'join' && (
          <>
            <label className="mb-1 mt-3 block text-sm font-bold text-paper" htmlFor="code">
              {fa.landing.code}
            </label>
            <input
              id="code"
              className="input text-center text-2xl font-black tracking-[0.5em]"
              dir="ltr"
              value={code}
              maxLength={4}
              placeholder={fa.landing.codePh}
              onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </>
        )}
        {err && (
          <p className="mt-3 rounded-lg bg-wax/25 px-3 py-2 text-sm font-bold text-waxlight" role="alert">
            {err}
          </p>
        )}
        <button className="btn btn-brass mt-4 w-full" disabled={busy} onClick={go}>
          {busy ? fa.common.loading : tab === 'create' ? fa.landing.createGo : fa.landing.joinGo}
        </button>
        {last && (
          <Link href={`/room/${last}`} className="btn btn-ghost mt-3 w-full text-sm">
            {fa.landing.rejoin} · <span dir="ltr">{last}</span>
          </Link>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-brass/25 bg-black/20 p-3">
        <p className="mb-2 text-sm font-bold text-paper">{fa.landing.tv}</p>
        <div className="flex gap-2">
          <input className="input !min-h-11 text-center font-black tracking-[0.4em]" dir="ltr" maxLength={4} placeholder={fa.landing.codePh} value={tvCode} onChange={(e) => setTvCode(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())} aria-label={fa.landing.tvHint} />
          <button className="btn btn-ghost !min-h-11 shrink-0 text-sm" disabled={tvCode.length !== 4} onClick={() => router.push(`/tv/${tvCode}`)}>
            {fa.landing.tvGo}
          </button>
        </div>
      </section>

      <p className="mt-4 text-center text-xs text-fog">{fa.landing.players}</p>
      <Skyline />
    </main>
  );
}
