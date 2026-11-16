import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from '../../src/lib/protocol';
import { RoomManager } from '../../src/server/room-manager';
import { NullStore } from '../../src/server/store';

type Client = Socket<ServerToClientEvents, ClientToServerEvents> & { last?: RoomState };

let http: HttpServer;
let manager: RoomManager;
let url = '';
const clients: Client[] = [];

beforeAll(async () => {
  http = createServer();
  const server = new Server<ClientToServerEvents, ServerToClientEvents>(http);
  manager = new RoomManager(server as never, new NullStore());
  server.on('connection', (s) => manager.attach(s as never));
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.close();
  await new Promise((r) => http.close(r));
});

function client(): Client {
  const c = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
  c.on('state', (s) => (c.last = s));
  clients.push(c);
  return c;
}

const emit = <T = Record<string, unknown>>(c: Client, ev: string, payload?: unknown) =>
  new Promise<{ ok: boolean; error?: string } & T>((resolve) => (c as unknown as { emit: (...a: unknown[]) => void }).emit(ev, payload, resolve));

const until = async (fn: () => boolean, ms = 3000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 15));
  }
};

describe('realtime server', () => {
  it('creates a room, joins, adds a bot, starts, reconnects, serves a safe TV view, and restarts', async () => {
    const host = client();
    const created = await emit<{ code: string; token: string; playerId: string }>(host, 'room:create', { nickname: 'سارا' });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z]{4}$/);

    const p2 = client();
    const j2 = await emit<{ token: string; playerId: string }>(p2, 'room:join', { code: created.code.toLowerCase(), nickname: 'علی' });
    expect(j2.ok).toBe(true);
    const dup = await emit(client(), 'room:join', { code: created.code, nickname: 'علی' });
    expect(dup).toEqual({ ok: false, error: 'nickname-taken' });
    const bad = await emit(client(), 'room:join', { code: 'ZZZZ', nickname: 'x' });
    expect(bad.error).toBe('no-room');

    // only the host can use host commands
    expect((await emit(p2, 'host', { cmd: 'addBot' })).error).toBe('not-host');
    expect((await emit(host, 'host', { cmd: 'start' })).error).toBe('too-few');
    expect((await emit(host, 'host', { cmd: 'addBot' })).ok).toBe(true);
    await until(() => host.last?.lobbyPlayers.length === 3);
    expect((await emit(host, 'host', { cmd: 'preset', preset: 'busy' })).ok).toBe(true);
    expect((await emit(host, 'host', { cmd: 'settings', settings: { rounds: 6, chatEnabled: true } })).ok).toBe(true);
    await until(() => host.last?.settings.rounds === 6 && host.last?.settings.whisperAllowed === true);

    // TV joins by code only
    const tv = client();
    expect((await emit(tv, 'tv:watch', { code: created.code })).ok).toBe(true);

    expect((await emit(host, 'host', { cmd: 'start' })).ok).toBe(true);
    await until(() => host.last?.game?.phase === 'info' && p2.last?.game?.phase === 'info' && tv.last?.game?.phase === 'info');

    // TV never receives private data
    const tvJson = JSON.stringify(tv.last);
    expect(tvJson).not.toContain('"me"');
    expect(tvJson).not.toContain('"cash"');
    expect(tvJson).not.toContain('"inventory"');
    expect(tv.last!.role).toBe('tv');
    // players get their own private view
    const myView = p2.last!.game as unknown as { me: { id: string; clue: unknown; cash: number } };
    expect(myView.me.id).toBe(j2.playerId);
    expect(myView.me.cash).toBe(1000);
    expect(myView.me.clue).toBeTruthy();

    // refresh: a new socket with the stored token gets the same seat and state back
    p2.close();
    await until(() => host.last?.lobbyPlayers.find((p) => p.id === j2.playerId)?.connected === false);
    const p2b = client();
    const res = await emit<{ playerId: string }>(p2b, 'room:resume', { code: created.code, token: j2.token });
    expect(res.playerId).toBe(j2.playerId);
    await until(() => !!p2b.last?.game);
    expect((p2b.last!.game as unknown as { me: { id: string } }).me.id).toBe(j2.playerId);
    expect((await emit(client(), 'room:resume', { code: created.code, token: 'nope' })).error).toBe('bad-token');

    // joining a running game is refused
    expect((await emit(client(), 'room:join', { code: created.code, nickname: 'تازه' })).error).toBe('in-progress');

    // invalid actions are rejected cleanly
    expect((await emit(p2b, 'action', { type: 'nope' })).error).toBe('bad-action');
    expect((await emit(p2b, 'action', { type: 'listCard', price: 10 })).error).toBe('market-closed');

    // chat (enabled in this room): only the current speaker may post during the tribune
    await emit(host, 'host', { cmd: 'skip' });
    await until(() => host.last?.game?.phase === 'tribune');
    const speakerId = host.last!.game!.speaker!.currentId;
    const speaker = speakerId === created.playerId ? host : p2b;
    const other = speaker === host ? p2b : host;
    expect((await emit(other, 'chat', { text: 'سلام' })).error).toBe('not-your-turn');
    expect((await emit(speaker, 'chat', { text: 'سلام بندر' })).ok).toBe(true);
    expect((await emit(speaker, 'chat', { text: 'دوباره' })).error).toBe('one-message');

    // play through the whole match with the host skipping, then restart
    let guard = 0;
    while (!(host.last?.game?.phase === 'final' && (host.last.game.final?.stage === 'again')) && guard++ < 400) {
      await emit(host, 'host', { cmd: 'skip' });
    }
    expect(host.last?.game?.final?.stage).toBe('again');
    const m1 = host.last!.matchNumber;
    expect((await emit(p2b, 'host', { cmd: 'restart' })).error).toBe('not-host');
    expect((await emit(host, 'host', { cmd: 'restart' })).ok).toBe(true);
    await until(() => host.last?.game?.phase === 'info' && host.last.matchNumber === m1 + 1);
    expect(host.last!.game!.round).toBe(1);
    expect(host.last!.lobbyPlayers).toHaveLength(3);
  }, 30000);
});
