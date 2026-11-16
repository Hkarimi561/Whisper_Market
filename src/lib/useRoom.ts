'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Action } from '../engine/actions';
import { TOKEN_KEY, type Ack, type ChatMessage, type ClientToServerEvents, type HostCommand, type RoomState, type ServerToClientEvents } from './protocol';

export type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function readToken(code: string): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY(code));
  } catch {
    return null;
  }
}
export function saveToken(code: string, token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY(code), token);
    window.localStorage.setItem('wm:lastRoom', code.toUpperCase());
  } catch {
    /* ignore */
  }
}
export function clearToken(code: string) {
  try {
    window.localStorage.removeItem(TOKEN_KEY(code));
    if (window.localStorage.getItem('wm:lastRoom') === code.toUpperCase()) window.localStorage.removeItem('wm:lastRoom');
  } catch {
    /* ignore */
  }
}

/** One-shot socket for create/join on the landing page. */
export function oneShot<T>(fn: (s: RoomSocket) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const s: RoomSocket = io({ transports: ['websocket', 'polling'], reconnection: false });
    const timer = setTimeout(() => {
      s.close();
      reject(new Error('disconnected'));
    }, 8000);
    s.on('connect', () => {
      fn(s).then(resolve, reject).finally(() => {
        clearTimeout(timer);
        // keep the socket open briefly so the server registers the player before we navigate away
        setTimeout(() => s.close(), 50);
      });
    });
    s.on('connect_error', () => {
      clearTimeout(timer);
      s.close();
      reject(new Error('disconnected'));
    });
  });
}

export function emitAck<R extends object>(s: RoomSocket, ev: keyof ClientToServerEvents, payload: unknown): Promise<Ack<R>> {
  return new Promise((resolve) => {
    (s as unknown as { emit: (...a: unknown[]) => void }).emit(ev, payload, (a: Ack<R>) => resolve(a));
  });
}

export type ConnStatus = 'connecting' | 'online' | 'offline' | 'denied';

export interface RoomApi {
  state: RoomState | null;
  status: ConnStatus;
  deniedReason: string | null;
  /** server-corrected clock */
  now: () => number;
  act: (a: Action) => Promise<Ack>;
  host: (c: HostCommand) => Promise<Ack>;
  chat: (text: string, to?: string) => Promise<Ack>;
  leave: () => Promise<void>;
  /** all chat received so far */
  chatLog: ChatMessage[];
}

export function useRoom(code: string, mode: 'player' | 'tv'): RoomApi {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [denied, setDenied] = useState<string | null>(null);
  const sockRef = useRef<RoomSocket | null>(null);
  const offset = useRef(0);

  useEffect(() => {
    const token = mode === 'player' ? readToken(code) : null;
    if (mode === 'player' && !token) {
      setStatus('denied');
      setDenied('no-token');
      return;
    }
    const s: RoomSocket = io({ transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 3000 });
    sockRef.current = s;
    const hello = async () => {
      const res =
        mode === 'player'
          ? await emitAck<{ playerId: string }>(s, 'room:resume', { code, token })
          : await emitAck<{ code: string }>(s, 'tv:watch', { code });
      if (res.ok) {
        setStatus('online');
        setDenied(null);
      } else {
        setStatus('denied');
        setDenied(res.error);
        if (res.error === 'bad-token' || res.error === 'no-room') clearToken(code);
        s.io.reconnection(false);
        s.close();
      }
    };
    s.on('connect', () => void hello());
    s.on('disconnect', () => setStatus((st) => (st === 'denied' ? st : 'offline')));
    s.on('connect_error', () => setStatus((st) => (st === 'denied' ? st : 'offline')));
    s.on('state', (st) => {
      offset.current = st.serverNow - Date.now();
      // tolerate a server that predates the warehouse-capacity setting
      st.settings.warehouseCapacity ??= 12;
      if (st.game) st.game.settings.warehouseCapacity ??= 12;
      setState(st);
    });
    s.on('kicked', () => {
      clearToken(code);
      setStatus('denied');
      setDenied('kicked');
    });
    return () => {
      s.close();
      sockRef.current = null;
    };
  }, [code, mode]);

  const now = useCallback(() => Date.now() + offset.current, []);
  const send = useCallback(<R extends object>(ev: keyof ClientToServerEvents, payload: unknown): Promise<Ack<R>> => {
    const s = sockRef.current;
    if (!s || !s.connected) return Promise.resolve({ ok: false, error: 'disconnected' } as Ack<R>);
    return emitAck<R>(s, ev, payload);
  }, []);
  const act = useCallback((a: Action) => send('action', a), [send]);
  const host = useCallback((c: HostCommand) => send('host', c), [send]);
  const chat = useCallback((text: string, to?: string) => send('chat', { text, to }), [send]);
  const leave = useCallback(async () => {
    await send('leave', undefined);
    clearToken(code);
  }, [send, code]);

  return { state, status, deniedReason: denied, now, act, host, chat, leave, chatLog: state?.chat ?? [] };
}

/** Seconds left until `deadline` (server clock), re-rendering ~4×/s. */
export function useCountdown(
  deadline: number | null,
  paused: boolean,
  pausedRemainingMs: number | null,
  now: () => number,
): { left: number; total: number } {
  const [, tick] = useState(0);
  const totalRef = useRef<{ key: string; total: number }>({ key: '', total: 0 });
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const ms = paused ? (pausedRemainingMs ?? 0) : deadline === null ? 0 : Math.max(0, deadline - now());
  const key = `${deadline ?? 'x'}`;
  if (totalRef.current.key !== key && deadline !== null) totalRef.current = { key, total: Math.max(ms, 1) };
  return { left: Math.ceil(ms / 1000), total: Math.max(1, Math.ceil(totalRef.current.total / 1000)) };
}
