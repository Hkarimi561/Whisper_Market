'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fa, errorText } from '../i18n/fa';
import { emitAck, oneShot, readToken, saveToken, useRoom } from '../lib/useRoom';
import { GoogleLogin, useGoogleClientId, type GoogleUser } from './google-login';
import { Lobby } from './lobby';
import { PlayerGame } from './player';
import { TvGame, TvLobby } from './tv';
import { Spinner } from './art';

function JoinForm({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [nick, setNick] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const googleId = useGoogleClientId();
  const [gUser, setGUser] = useState<GoogleUser | null>(null);
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4">
      <h1 className="brass-text text-center text-3xl font-black">{fa.join.title}</h1>
      <p className="text-center text-5xl font-black tracking-[0.3em]" dir="ltr">
        {code}
      </p>
      {googleId && <GoogleLogin clientId={googleId} user={gUser} onUser={setGUser} />}
      <input className="input" value={nick} maxLength={14} onChange={(e) => setNick(e.target.value)} placeholder={fa.landing.nicknamePh} aria-label={fa.landing.nickname} />
      {err && <p className="rounded-lg bg-wax/25 px-3 py-2 text-sm font-bold text-waxlight">{err}</p>}
      <button
        className="btn btn-brass"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr('');
          try {
            const res = await oneShot((s) => emitAck<{ code: string; token: string; playerId: string }>(s, 'room:join', { code, nickname: nick || gUser?.name || '', credential: gUser?.credential }));
            if (!res.ok) {
              setErr(errorText(res.error));
              setBusy(false);
              return;
            }
            saveToken(res.code, res.token);
            onJoined();
          } catch {
            setErr(errorText('disconnected'));
            setBusy(false);
          }
        }}
      >
        {fa.landing.joinGo}
      </button>
      <Link href="/" className="btn btn-ghost text-sm">
        {fa.common.back}
      </Link>
    </main>
  );
}

export function PlayerRoom({ code }: { code: string }) {
  const upper = code.toUpperCase();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => setHasToken(!!readToken(upper)), [upper, epoch]);
  if (hasToken === null) return <Spinner label={fa.common.connecting} />;
  if (!hasToken) return <JoinForm code={upper} onJoined={() => setEpoch((e) => e + 1)} />;
  return <PlayerRoomInner key={epoch} code={upper} onLost={() => setEpoch((e) => e + 1)} />;
}

function PlayerRoomInner({ code, onLost }: { code: string; onLost: () => void }) {
  const api = useRoom(code, 'player');
  const { state, status, deniedReason } = api;
  if (status === 'denied') {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4 text-center">
        <p className="text-xl font-black">{deniedReason === 'kicked' ? 'میزبان تو را از اتاق بیرون کرد.' : errorText(deniedReason ?? undefined)}</p>
        {deniedReason === 'in-progress' || deniedReason === 'bad-token' ? (
          <button className="btn btn-ghost" onClick={onLost}>
            {fa.common.back}
          </button>
        ) : null}
        <Link href="/" className="btn btn-brass">
          {fa.common.back}
        </Link>
      </main>
    );
  }
  if (!state) return <Spinner label={fa.common.connecting} />;
  return (
    <>
      {status === 'offline' && <p className="fixed inset-x-0 top-0 z-50 bg-wax px-3 py-1 text-center text-sm font-black text-white">{fa.common.reconnecting}</p>}
      {state.status === 'lobby' || !state.game ? <Lobby state={state} api={api} /> : <PlayerGame state={state} api={api} />}
    </>
  );
}

export function TvRoom({ code }: { code: string }) {
  const upper = code.toUpperCase();
  const api = useRoom(upper, 'tv');
  const { state, status, deniedReason } = api;
  if (status === 'denied')
    return (
      <main className="grid min-h-dvh place-items-center text-center">
        <div className="grid gap-4">
          <p className="text-5xl font-black">{errorText(deniedReason ?? undefined)}</p>
          <Link href="/" className="btn btn-brass mx-auto text-2xl">
            {fa.common.back}
          </Link>
        </div>
      </main>
    );
  if (!state) return <Spinner label={fa.common.connecting} />;
  return state.status === 'lobby' || !state.game ? <TvLobby state={state} /> : <TvGame state={state} api={api} />;
}
