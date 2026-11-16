// Optional "Sign in with Google": verifies a Google Identity Services ID token on the server.
import { GameError } from '../engine/game';

export interface GoogleIdentity {
  sub: string;
  name: string;
  picture?: string;
}

export function googleEnabled(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID;
}

/** Returns null when no credential was sent; throws GameError('bad-google' | 'google-off') otherwise. */
export async function verifyGoogleCredential(credential: unknown): Promise<GoogleIdentity | null> {
  if (credential === undefined || credential === null || credential === '') return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new GameError('google-off');
  if (typeof credential !== 'string' || credential.length > 4096) throw new GameError('bad-google');
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error('rejected');
    const t = (await res.json()) as Record<string, string>;
    const issOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
    if (t.aud !== clientId || !issOk || !t.sub || Number(t.exp) * 1000 < Date.now()) throw new Error('invalid');
    return { sub: t.sub, name: (t.given_name || t.name || '').trim(), picture: t.picture };
  } catch {
    throw new GameError('bad-google');
  }
}
