// Types shared by the server and the client for the socket protocol.
import type { Settings } from '../engine/config';
import type { Action } from '../engine/actions';
import type { PlayerView, PublicView } from '../engine/views';

export interface LobbyPlayer {
  id: string;
  nickname: string;
  isBot: boolean;
  connected: boolean;
  seat: number;
  isHost: boolean;
}

export interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  /** set for whispers */
  to?: string;
  text: string;
  at: number;
  round: number;
}

export interface RoomState {
  code: string;
  role: 'player' | 'tv';
  you: string | null;
  hostId: string | null;
  status: 'lobby' | 'playing';
  settings: Settings;
  lobbyPlayers: LobbyPlayer[];
  game: PlayerView | PublicView | null;
  chat: ChatMessage[];
  serverNow: number;
  matchNumber: number;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type HostCommand =
  | { cmd: 'settings'; settings: Partial<Settings> }
  | { cmd: 'preset'; preset: 'open' | 'busy' }
  | { cmd: 'addBot' }
  | { cmd: 'removeBot'; id: string }
  | { cmd: 'kick'; id: string }
  | { cmd: 'start' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'skip' }
  | { cmd: 'restart' };

export interface ClientToServerEvents {
  'room:create': (p: { nickname: string; credential?: string }, ack: (a: Ack<{ code: string; token: string; playerId: string }>) => void) => void;
  'room:join': (p: { code: string; nickname: string; credential?: string }, ack: (a: Ack<{ code: string; token: string; playerId: string }>) => void) => void;
  'room:resume': (p: { code: string; token: string }, ack: (a: Ack<{ code: string; playerId: string }>) => void) => void;
  'tv:watch': (p: { code: string }, ack: (a: Ack<{ code: string }>) => void) => void;
  action: (p: Action, ack: (a: Ack) => void) => void;
  host: (p: HostCommand, ack: (a: Ack) => void) => void;
  chat: (p: { text: string; to?: string }, ack: (a: Ack) => void) => void;
  leave: (ack?: (a: Ack) => void) => void;
}

export interface ServerToClientEvents {
  state: (s: RoomState) => void;
  kicked: () => void;
}

export const TOKEN_KEY = (code: string) => `wm:token:${code.toUpperCase()}`;
