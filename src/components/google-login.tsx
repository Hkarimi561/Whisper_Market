'use client';
// Optional Google sign-in (Google Identity Services). Hidden when GOOGLE_CLIENT_ID is not configured.
import { useEffect, useRef, useState } from 'react';
import { fa } from '../i18n/fa';

export interface GoogleUser {
  credential: string;
  name: string;
}

interface Gsi {
  accounts: {
    id: {
      initialize: (c: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
      disableAutoSelect: () => void;
    };
  };
}

function decodeName(jwt: string): string {
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
    return String(payload.given_name || payload.name || '');
  } catch {
    return '';
  }
}

export function useGoogleClientId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c: { googleClientId: string | null }) => setId(c.googleClientId))
      .catch(() => setId(null));
  }, []);
  return id;
}

export function GoogleLogin({ clientId, user, onUser }: { clientId: string; user: GoogleUser | null; onUser: (u: GoogleUser | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (user) return;
    const init = () => {
      const g = (window as unknown as { google?: Gsi }).google;
      if (!g || !box.current) return;
      g.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => onUser({ credential: r.credential, name: decodeName(r.credential) }),
      });
      g.accounts.id.renderButton(box.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'fa', width: 280 });
    };
    if ((window as unknown as { google?: Gsi }).google) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
    return () => {
      s.onload = null;
    };
  }, [clientId, user, onUser]);

  if (user)
    return (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-mosslight/40 bg-moss/15 px-3 py-2 text-sm">
        <span className="font-bold">
          ✓ {fa.landing.googleAs}: {user.name}
        </span>
        <button
          className="btn btn-ghost !min-h-11 text-xs"
          onClick={() => {
            (window as unknown as { google?: Gsi }).google?.accounts.id.disableAutoSelect();
            onUser(null);
          }}
        >
          {fa.landing.googleOut}
        </button>
      </div>
    );
  return (
    <div className="mb-3 grid justify-items-center gap-1">
      <div ref={box} className="min-h-11" dir="ltr" />
      <p className="text-center text-xs text-fog">{fa.landing.googleHint}</p>
    </div>
  );
}
