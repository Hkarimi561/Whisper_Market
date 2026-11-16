'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { fa } from '../i18n/fa';
import { isMuted, setMuted, sfx, subscribeMute } from '../lib/sound';

export function useMuted(): [boolean, (m: boolean) => void] {
  const m = useSyncExternalStore(subscribeMute, isMuted, () => false);
  return [m, setMuted];
}

export function MuteButton({ className = '' }: { className?: string }) {
  const [m, set] = useMuted();
  return (
    <button
      type="button"
      className={`grid size-11 place-items-center rounded-full border border-brass/40 bg-white/5 text-lg ${className}`}
      aria-label={m ? fa.common.unmute : fa.common.mute}
      aria-pressed={m}
      onClick={() => {
        set(!m);
        if (m) sfx.coin();
      }}
    >
      <span aria-hidden>{m ? '🔇' : '🔊'}</span>
    </button>
  );
}

export function useToasts() {
  const [items, setItems] = useState<{ id: number; text: string; tone: 'bad' | 'ok' }[]>([]);
  const push = useCallback((text: string, tone: 'bad' | 'ok' = 'bad') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
  }, []);
  const node = (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 grid justify-items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {items.map((i) => (
          <motion.div
            key={i.id}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`rounded-xl px-4 py-2 text-sm font-bold shadow-xl ${i.tone === 'bad' ? 'bg-wax text-white' : 'bg-moss text-white'}`}
          >
            {i.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
  return { push, node };
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal aria-label={label}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="paper w-full max-w-sm p-6">
        {children}
      </motion.div>
    </motion.div>
  );
}

export function Waiting({ text = fa.common.wait }: { text?: string }) {
  return (
    <div className="grid place-items-center gap-2 py-8 text-fog">
      <svg width="40" height="56" viewBox="0 0 40 56" className="sway" aria-hidden>
        <path d="M20 0v8" stroke="#8a6428" strokeWidth="2" />
        <rect x="11" y="12" width="18" height="30" rx="5" fill="#f4b24a" fillOpacity=".45" stroke="#c19a52" strokeWidth="2" />
        <ellipse cx="20" cy="30" rx="4" ry="7" fill="#ffd98a" className="flicker" />
      </svg>
      <p className="font-bold">{text}</p>
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-xl font-black brass-text">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-fog">{sub}</p>}
    </div>
  );
}
