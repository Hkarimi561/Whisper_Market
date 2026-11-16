// Authoritative room/game manager: lobby, timers, bots, reconnects, persistence hooks.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { actionSchema, applyAction } from '../engine/actions';
import { botTick, newBotMemory, planOrders, type BotMemory } from '../engine/bots';
import { CONFIG, PRESETS, defaultSettings, sanitizeSettings, type Settings } from '../engine/config';
import { GameError, advance, convertToBot, createMatch, pause, restartMatch, resume, setOrders } from '../engine/game';
import { Rng } from '../engine/rng';
import type { GameState } from '../engine/types';
import { buildPlayerView, buildPublicView, type PlayerView } from '../engine/views';
import type {
  Ack,
  ChatMessage,
  ClientToServerEvents,
  HostCommand,
  LobbyPlayer,
  RoomState,
  ServerToClientEvents,
} from '../lib/protocol';
import { verifyGoogleCredential, type GoogleIdentity } from './google';
import type { PersistedRoom, Store } from './store';

type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
interface SocketData {
  code?: string;
  playerId?: string | null;
  tv?: boolean;
}

interface RoomPlayer {
  id: string;
  nickname: string;
  tokenHash: string;
  isBot: boolean;
  seat: number;
  lastSeen: number;
  googleSub?: string;
}

export class Room {
  code: string;
  hostId: string | null = null;
  settings: Settings = defaultSettings();
  players: RoomPlayer[] = [];
  game: GameState | null = null;
  matchId: string | null = null;
  seedCounter = 0;
  chat: ChatMessage[] = [];
  sockets = new Map<string, string | null>(); // socket id -> player id (null = TV)
  timer: NodeJS.Timeout | null = null;
  botMem = new Map<string, BotMemory>();
  botRng = new Rng(randomInt(1, 2 ** 31));
  lastKey = '';
  broadcastPending = false;
  snapshotTimer: NodeJS.Timeout | null = null;
  speakerPosted = new Set<string>();
  hostGoneSince: number | null = null;
  lastActivity = Date.now();
  constructor(code: string) {
    this.code = code;
  }
  get status(): 'lobby' | 'playing' {
    return this.game ? 'playing' : 'lobby';
  }
  isConnected(pid: string) {
    for (const v of this.sockets.values()) if (v === pid) return true;
    return false;
  }
}

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const newToken = () => randomBytes(18).toString('base64url');
const nowMs = () => Date.now();

function fail(code: string): never {
  throw new GameError(code);
}

export class RoomManager {
  rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout | null = null;
  private botTicker: NodeJS.Timeout | null = null;

  constructor(
    private io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    private store: Store,
  ) {}

  // ------------------------------------------------------------ lifecycle

  async start() {
    const saved = await this.store.loadActive(24 * 3600 * 1000);
    for (const p of saved) {
      try {
        this.restore(p);
      } catch (e) {
        console.error('[rooms] could not restore', p.code, e);
      }
    }
    if (saved.length) console.log(`[rooms] restored ${this.rooms.size} room(s) from snapshot`);
    this.botTicker = setInterval(() => this.tickBots(), 900);
    this.sweeper = setInterval(() => this.sweep(), 30_000);
  }

  async stop() {
    if (this.botTicker) clearInterval(this.botTicker);
    if (this.sweeper) clearInterval(this.sweeper);
    for (const r of this.rooms.values()) {
      if (r.timer) clearTimeout(r.timer);
      await this.store.saveRoom(this.toPersisted(r));
    }
    await this.store.close();
  }

  private restore(p: PersistedRoom) {
    const room = new Room(p.code);
    room.hostId = p.hostId;
    room.settings = p.settings;
    room.players = p.players.map((x) => ({ ...x, lastSeen: nowMs() }));
    room.game = p.game;
    room.matchId = p.matchId;
    room.seedCounter = p.seedCounter ?? 0;
    room.lastKey = this.keyOf(room);
    for (const pl of room.players) if (pl.isBot) room.botMem.set(pl.id, newBotMemory());
    this.rooms.set(room.code, room);
    this.schedule(room);
  }

  private toPersisted(room: Room): PersistedRoom {
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      settings: room.settings,
      players: room.players.map((p) => ({ id: p.id, nickname: p.nickname, seat: p.seat, isBot: p.isBot, tokenHash: p.tokenHash, googleSub: p.googleSub })),
      game: room.game,
      matchId: room.matchId,
      seedCounter: room.seedCounter,
      updatedAt: nowMs(),
    };
  }

  private sweep() {
    const now = nowMs();
    for (const room of this.rooms.values()) {
      // host handover when the host has been away for a while
      const host = room.players.find((p) => p.id === room.hostId);
      if (host && !room.isConnected(host.id)) {
        room.hostGoneSince ??= now;
        if (now - room.hostGoneSince > 45_000) {
          const next = room.players.find((p) => !p.isBot && room.isConnected(p.id));
          if (next) {
            room.hostId = next.id;
            room.hostGoneSince = null;
            this.touch(room);
          }
        }
      } else room.hostGoneSince = null;
      const idle = now - room.lastActivity;
      if (room.sockets.size === 0 && idle > 6 * 3600 * 1000) this.destroy(room);
    }
  }

  private destroy(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
    this.rooms.delete(room.code);
    void this.store.closeRoom(room.code);
  }

  // ------------------------------------------------------------ socket wiring

  attach(socket: IoSocket) {
    const wrap = (fn: () => object | void, ack?: (a: Ack<never>) => void) => {
      try {
        const out = fn();
        ack?.({ ok: true, ...(out ?? {}) } as never);
      } catch (e) {
        const code = e instanceof GameError ? e.code : 'internal';
        if (!(e instanceof GameError)) console.error('[socket] error', e);
        ack?.({ ok: false, error: code } as never);
      }
    };
    const safeAck = <T>(ack: unknown): ((a: Ack<T>) => void) | undefined => (typeof ack === 'function' ? (ack as (a: Ack<T>) => void) : undefined);

    const verify = async (cred: unknown, ack: unknown): Promise<{ ok: boolean; g: GoogleIdentity | null }> => {
      try {
        return { ok: true, g: await verifyGoogleCredential(cred) };
      } catch (e) {
        safeAck(ack)?.({ ok: false, error: e instanceof GameError ? e.code : 'bad-google' } as never);
        return { ok: false, g: null };
      }
    };
    socket.on('room:create', async (p, ack) => {
      const v = await verify(p?.credential, ack);
      if (!v.ok) return;
      wrap(() => {
        const nick = this.cleanNick(p?.nickname || v.g?.name);
        const room = this.newRoom();
        const { player, token } = this.addPlayer(room, nick, false, v.g?.sub);
        room.hostId = player.id;
        this.bind(socket, room, player.id);
        this.touch(room, true);
        return { code: room.code, token, playerId: player.id };
      }, safeAck(ack));
    });
    socket.on('room:join', async (p, ack) => {
      const v = await verify(p?.credential, ack);
      if (!v.ok) return;
      wrap(() => {
        const room = this.getRoom(p?.code);
        // the same Google account taking its seat back (other device / lost token)
        const mine = v.g ? room.players.find((x) => !x.isBot && x.googleSub === v.g!.sub) : undefined;
        if (mine) {
          const token = newToken();
          mine.tokenHash = hash(token);
          this.bind(socket, room, mine.id);
          this.touch(room, true);
          return { code: room.code, token, playerId: mine.id };
        }
        if (room.game) fail('in-progress');
        const nick = this.cleanNick(p?.nickname || v.g?.name);
        if (room.players.length >= CONFIG.maxPlayers) fail('room-full');
        if (room.players.some((x) => x.nickname === nick)) fail('nickname-taken');
        const { player, token } = this.addPlayer(room, nick, false, v.g?.sub);
        this.bind(socket, room, player.id);
        this.touch(room, true);
        return { code: room.code, token, playerId: player.id };
      }, safeAck(ack));
    });
    socket.on('room:resume', (p, ack) =>
      wrap(() => {
        const room = this.getRoom(p?.code);
        const h = typeof p?.token === 'string' ? hash(p.token) : '';
        const player = room.players.find((x) => !x.isBot && x.tokenHash === h);
        if (!player) fail('bad-token');
        this.bind(socket, room, player.id);
        this.touch(room);
        return { code: room.code, playerId: player.id };
      }, safeAck(ack)),
    );
    socket.on('tv:watch', (p, ack) =>
      wrap(() => {
        const room = this.getRoom(p?.code);
        this.bind(socket, room, null);
        this.broadcast(room);
        return { code: room.code };
      }, safeAck(ack)),
    );
    socket.on('action', (p, ack) =>
      wrap(() => {
        const { room, pid } = this.ctx(socket);
        if (!room.game) fail('no-game');
        const parsed = actionSchema.safeParse(p);
        if (!parsed.success) fail('bad-action');
        applyAction(room.game, pid, parsed.data, nowMs());
        this.afterChange(room);
      }, safeAck(ack)),
    );
    socket.on('host', (p, ack) =>
      wrap(() => {
        const { room, pid } = this.ctx(socket);
        if (room.hostId !== pid) fail('not-host');
        this.hostCommand(room, p);
      }, safeAck(ack)),
    );
    socket.on('chat', (p, ack) =>
      wrap(() => {
        const { room, pid } = this.ctx(socket);
        this.postChat(room, pid, p?.text, p?.to);
      }, safeAck(ack)),
    );
    socket.on('leave', (ack) =>
      wrap(() => {
        const { room, pid } = this.ctx(socket);
        this.removePlayer(room, pid, false);
        socket.disconnect(true);
      }, safeAck(ack)),
    );
    socket.on('disconnect', () => {
      const code = socket.data.code;
      if (!code) return;
      const room = this.rooms.get(code);
      if (!room) return;
      room.sockets.delete(socket.id);
      const pid = socket.data.playerId;
      if (pid) {
        const pl = room.players.find((x) => x.id === pid);
        if (pl) pl.lastSeen = nowMs();
      }
      this.broadcast(room);
    });
  }

  private ctx(socket: IoSocket): { room: Room; pid: string } {
    const code = socket.data.code;
    const pid = socket.data.playerId;
    const room = code ? this.rooms.get(code) : undefined;
    if (!room || !pid) fail('not-in-room');
    if (!room.players.some((p) => p.id === pid)) fail('not-in-room');
    return { room, pid };
  }

  private bind(socket: IoSocket, room: Room, pid: string | null) {
    socket.data.code = room.code;
    socket.data.playerId = pid;
    socket.data.tv = pid === null;
    room.sockets.set(socket.id, pid);
    room.lastActivity = nowMs();
    void socket.join(room.code);
    this.broadcast(room);
  }

  // ------------------------------------------------------------ lobby

  private cleanNick(n: unknown): string {
    const s = typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, CONFIG.nicknameMax) : '';
    if (!s) fail('bad-nickname');
    return s;
  }

  private newRoom(): Room {
    for (let i = 0; i < 200; i++) {
      let code = '';
      for (let k = 0; k < 4; k++) code += CONFIG.roomCodeLetters[randomInt(CONFIG.roomCodeLetters.length)];
      if (!this.rooms.has(code)) {
        const room = new Room(code);
        this.rooms.set(code, room);
        return room;
      }
    }
    return fail('no-code');
  }

  private getRoom(code: unknown): Room {
    const c = typeof code === 'string' ? code.trim().toUpperCase() : '';
    const room = this.rooms.get(c);
    if (!room) fail('no-room');
    return room;
  }

  private addPlayer(room: Room, nickname: string, isBot: boolean, googleSub?: string) {
    const id = `${isBot ? 'b' : 'p'}${randomBytes(4).toString('hex')}`;
    const token = newToken();
    const seat = room.players.length;
    const player: RoomPlayer = { id, nickname, tokenHash: hash(token), isBot, seat, lastSeen: nowMs(), googleSub };
    room.players.push(player);
    if (isBot) room.botMem.set(id, newBotMemory());
    return { player, token };
  }

  private removePlayer(room: Room, pid: string, kicked: boolean) {
    const idx = room.players.findIndex((p) => p.id === pid);
    if (idx < 0) return;
    if (room.game) {
      // mid-game: a bot takes over the seat so the match stays consistent
      const pl = room.players[idx];
      convertToBot(room.game, pid);
      pl.isBot = true;
      pl.tokenHash = '';
      room.botMem.set(pid, newBotMemory());
    } else {
      room.players.splice(idx, 1);
      room.players.forEach((p, i) => (p.seat = i));
    }
    for (const [sid, v] of room.sockets) {
      if (v !== pid) continue;
      room.sockets.delete(sid);
      const s = this.io.sockets.sockets.get(sid);
      if (s && kicked) {
        s.emit('kicked');
        s.data.playerId = undefined;
        s.data.code = undefined;
        void s.leave(room.code);
      }
    }
    if (room.hostId === pid) room.hostId = room.players.find((p) => !p.isBot && !(room.game && p.id === pid))?.id ?? null;
    if (room.game) this.afterChange(room);
    else this.touch(room, true);
  }

  private hostCommand(room: Room, c: HostCommand) {
    const now = nowMs();
    switch (c.cmd) {
      case 'settings':
        if (room.game) fail('in-progress');
        room.settings = sanitizeSettings({ ...room.settings, ...c.settings, preset: 'custom' }, room.settings);
        return this.touch(room, true);
      case 'preset':
        if (room.game) fail('in-progress');
        if (c.preset !== 'open' && c.preset !== 'busy') fail('bad-preset');
        room.settings = { ...PRESETS[c.preset], rounds: room.settings.rounds, chatEnabled: room.settings.chatEnabled };
        return this.touch(room, true);
      case 'addBot': {
        if (room.game) fail('in-progress');
        if (room.players.length >= CONFIG.maxPlayers) fail('room-full');
        const names = ['باربد', 'شیرین', 'کاوه', 'مهسا', 'بهرام', 'آرزو', 'فرهاد', 'نازی'];
        const used = new Set(room.players.map((p) => p.nickname));
        const nick = names.find((n) => !used.has(n)) ?? `ربات ${room.players.length + 1}`;
        this.addPlayer(room, nick, true);
        return this.touch(room, true);
      }
      case 'removeBot': {
        if (room.game) fail('in-progress');
        const p = room.players.find((x) => x.id === c.id && x.isBot);
        if (!p) fail('no-player');
        return this.removePlayer(room, p.id, false);
      }
      case 'kick': {
        const p = room.players.find((x) => x.id === c.id);
        if (!p || p.id === room.hostId) fail('no-player');
        return this.removePlayer(room, p.id, true);
      }
      case 'start': {
        if (room.game) fail('in-progress');
        const n = room.players.length;
        if (n < CONFIG.minPlayers) fail('too-few');
        if (!room.players.some((p) => !p.isBot)) fail('need-human');
        this.startMatch(room, false);
        return;
      }
      case 'pause':
        if (!room.game) fail('no-game');
        pause(room.game, now);
        return this.afterChange(room);
      case 'resume':
        if (!room.game) fail('no-game');
        resume(room.game, now);
        return this.afterChange(room);
      case 'skip':
        if (!room.game) fail('no-game');
        advance(room.game, now);
        return this.afterChange(room);
      case 'restart':
        if (!room.game || room.game.phase !== 'final') fail('not-final');
        this.startMatch(room, true);
        return;
    }
  }

  private startMatch(room: Room, restart: boolean) {
    const now = nowMs();
    const seed = randomInt(1, 2 ** 31);
    room.seedCounter += 1;
    if (restart && room.game) room.game = restartMatch(room.game, seed, now);
    else {
      room.game = createMatch(
        { seed, settings: room.settings, players: room.players.map((p) => ({ id: p.id, nickname: p.nickname, isBot: p.isBot })) },
        now,
      );
    }
    room.matchId = `${room.code}-${now.toString(36)}-${room.seedCounter}`;
    room.speakerPosted.clear();
    room.lastKey = '';
    void this.store.saveMatchStart(this.toPersisted(room), room.matchId, room.game);
    this.afterChange(room);
  }

  // ------------------------------------------------------------ chat

  private postChat(room: Room, pid: string, text: unknown, to?: string) {
    if (!room.settings.chatEnabled) fail('chat-off');
    const me = room.players.find((p) => p.id === pid);
    if (!me) fail('not-in-room');
    const t = typeof text === 'string' ? text.trim().slice(0, CONFIG.chat.maxLength) : '';
    if (!t) fail('empty');
    if (to) {
      if (!room.settings.whisperAllowed) fail('whisper-off');
      if (!room.players.some((p) => p.id === to) || to === pid) fail('no-player');
    } else if (room.game?.phase === 'tribune') {
      const r = room.game.rounds[room.game.round - 1];
      if (r.speakerOrder[r.speakerIndex] !== pid) fail('not-your-turn');
      const key = `${room.game.round}:${r.speakerIndex}`;
      if (room.speakerPosted.has(key)) fail('one-message');
      room.speakerPosted.add(key);
    }
    const msg: ChatMessage = {
      id: randomBytes(5).toString('hex'),
      from: pid,
      fromName: me.nickname,
      to: to || undefined,
      text: t,
      at: nowMs(),
      round: room.game?.round ?? 0,
    };
    room.chat.push(msg);
    if (room.chat.length > CONFIG.chat.maxHistory) room.chat.shift();
    this.broadcast(room);
  }

  // ------------------------------------------------------------ game flow

  private keyOf(room: Room): string {
    const g = room.game;
    return g ? `${g.matchNumber}:${g.round}:${g.phase}` : 'lobby';
  }

  /** Called after any state change of a running game. */
  private afterChange(room: Room) {
    const g = room.game;
    if (!g) return this.touch(room);
    room.lastActivity = nowMs();
    const key = this.keyOf(room);
    const phaseChanged = key !== room.lastKey;
    const prev = room.lastKey;
    room.lastKey = key;
    if (phaseChanged) {
      this.onPhaseEnter(room, prev);
      this.snapshotNow(room);
    } else this.touch(room);
    // a step change inside reveal/final that resolved a round the first time is handled in onPhaseEnter
    this.schedule(room);
    this.broadcast(room);
  }

  private onPhaseEnter(room: Room, _prev: string) {
    const g = room.game!;
    room.speakerPosted.clear();
    if (g.phase === 'orders') {
      // bots draft their orders immediately so an early finish never drops them
      const now = nowMs();
      for (const p of g.players.filter((x) => x.isBot)) {
        try {
          const view = buildPlayerView(g, p.id, { code: room.code, now, connected: () => true });
          const a = planOrders(view, room.botRng);
          if (a.type === 'orders') setOrders(g, p.id, { orders: a.orders, bid: a.bid }, false, now);
        } catch {
          /* a bot draft failing is harmless */
        }
      }
    }
    if (g.phase === 'reveal' && g.step === 0 && room.matchId) {
      void this.store.saveRound(this.toPersisted(room), room.matchId, g.rounds[g.round - 1], g);
    }
    if (g.phase === 'final' && room.matchId) void this.store.saveMatchEnd(room.matchId, g);
  }

  private schedule(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const g = room.game;
    if (!g || g.paused || g.deadline === null) return;
    const wait = Math.max(0, g.deadline - nowMs());
    room.timer = setTimeout(() => {
      room.timer = null;
      try {
        if (!room.game || room.game.paused || room.game.deadline === null) return;
        if (nowMs() + 50 < room.game.deadline) return this.schedule(room);
        advance(room.game, nowMs());
      } catch (e) {
        console.error('[rooms] advance failed', e);
      }
      this.afterChange(room);
    }, wait + 5);
  }

  private tickBots() {
    const now = nowMs();
    for (const room of this.rooms.values()) {
      const g = room.game;
      if (!g || g.paused) continue;
      if (g.phase !== 'market' && g.phase !== 'orders') continue;
      let changed = false;
      for (const p of g.players.filter((x) => x.isBot)) {
        const mem = room.botMem.get(p.id) ?? newBotMemory();
        room.botMem.set(p.id, mem);
        let view: PlayerView;
        try {
          view = buildPlayerView(g, p.id, { code: room.code, now, connected: () => true });
        } catch {
          continue;
        }
        const a = botTick(view, mem, room.botRng, now);
        if (!a) continue;
        try {
          applyAction(g, p.id, a, now);
          changed = true;
        } catch {
          /* rejected bot actions are ignored */
        }
        if (g.phase !== view.phase) break;
      }
      if (changed) this.afterChange(room);
    }
  }

  // ------------------------------------------------------------ persistence + emit

  private snapshotNow(room: Room) {
    if (room.snapshotTimer) clearTimeout(room.snapshotTimer);
    room.snapshotTimer = null;
    void this.store.saveRoom(this.toPersisted(room));
  }

  /** Lobby/room changed: broadcast and (debounced) snapshot. */
  private touch(room: Room, immediate = false) {
    room.lastActivity = nowMs();
    this.broadcast(room);
    if (immediate) return this.snapshotNow(room);
    if (room.snapshotTimer) return;
    room.snapshotTimer = setTimeout(() => {
      room.snapshotTimer = null;
      void this.store.saveRoom(this.toPersisted(room));
    }, 3000);
  }

  broadcast(room: Room) {
    if (room.broadcastPending) return;
    room.broadcastPending = true;
    queueMicrotask(() => {
      room.broadcastPending = false;
      this.emitAll(room);
    });
  }

  private lobbyPlayers(room: Room): LobbyPlayer[] {
    return room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isBot: p.isBot,
      connected: p.isBot || room.isConnected(p.id),
      seat: p.seat,
      isHost: p.id === room.hostId,
    }));
  }

  private emitAll(room: Room) {
    const now = nowMs();
    const lobbyPlayers = this.lobbyPlayers(room);
    const connected = (id: string) => room.isConnected(id);
    const g = room.game;
    const publicView = g ? buildPublicView(g, { code: room.code, now, connected }) : null;
    for (const [sid, pid] of room.sockets) {
      const sock = this.io.sockets.sockets.get(sid);
      if (!sock) continue;
      let game: RoomState['game'] = null;
      if (g) {
        if (pid) {
          try {
            game = buildPlayerView(g, pid, { code: room.code, now, connected });
          } catch {
            game = publicView;
          }
        } else game = publicView;
      }
      const chat = room.chat.filter((m) => !m.to || (pid && (m.to === pid || m.from === pid)));
      const state: RoomState = {
        code: room.code,
        role: pid ? 'player' : 'tv',
        you: pid,
        hostId: room.hostId,
        status: room.status,
        settings: room.settings,
        lobbyPlayers,
        game,
        chat: pid || room.settings.whisperAllowed === false ? chat : chat.filter((m) => !m.to),
        serverNow: now,
        matchNumber: g?.matchNumber ?? 0,
      };
      sock.emit('state', state);
    }
  }
}
