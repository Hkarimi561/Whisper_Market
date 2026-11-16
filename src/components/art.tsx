'use client';
// Hand-drawn SVG art: goods, lantern, purse, wax seal, fuse timer, warehouse. No image assets.
import { animate } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Good } from '../engine/config';
import { toFa } from '../engine/describe';
import { sfx } from '../lib/sound';

export const GOOD_COLOR: Record<Good, string> = {
  wheat: '#e6bd52',
  fuel: '#e2692f',
  iron: '#9db3cc',
  medicine: '#e7544f',
  chips: '#3fc3a3',
};

export function GoodIcon({ good, size = 48, className = '' }: { good: Good; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 64 64', className, 'aria-hidden': true } as const;
  switch (good) {
    case 'wheat':
      return (
        <svg {...common}>
          <rect x="8" y="36" width="48" height="22" rx="3" fill="#8a5d33" stroke="#4a2f17" strokeWidth="2" />
          <path d="M8 44h48M8 51h48" stroke="#5e3d1f" strokeWidth="2" />
          <g stroke="#c9972a" strokeWidth="2" strokeLinecap="round">
            <path d="M20 36V14M32 36V8M44 36V14" />
          </g>
          {[20, 32, 44].map((x, i) => (
            <g key={x} fill="#f0c95e" stroke="#b9871f" strokeWidth="1">
              {[0, 7, 14].map((dy) => (
                <g key={dy}>
                  <ellipse cx={x - 3.5} cy={(i === 1 ? 14 : 20) + dy} rx="3" ry="5" transform={`rotate(-25 ${x - 3.5} ${(i === 1 ? 14 : 20) + dy})`} />
                  <ellipse cx={x + 3.5} cy={(i === 1 ? 14 : 20) + dy} rx="3" ry="5" transform={`rotate(25 ${x + 3.5} ${(i === 1 ? 14 : 20) + dy})`} />
                </g>
              ))}
            </g>
          ))}
        </svg>
      );
    case 'fuel':
      return (
        <svg {...common}>
          <rect x="14" y="8" width="36" height="50" rx="9" fill="#b9411d" stroke="#5a1c0b" strokeWidth="2" />
          <rect x="14" y="19" width="36" height="5" fill="#7d2a12" />
          <rect x="14" y="42" width="36" height="5" fill="#7d2a12" />
          <rect x="26" y="3" width="12" height="7" rx="2" fill="#7a7f86" stroke="#3a3d42" strokeWidth="1.5" />
          <path d="M32 27c5 5 7 8 7 11a7 7 0 0 1-14 0c0-3 2-6 7-11z" fill="#ffb347" stroke="#7d2a12" strokeWidth="1.5" />
        </svg>
      );
    case 'iron':
      return (
        <svg {...common}>
          <path d="M6 52l5-12h24l5 12z" fill="#7d93ad" stroke="#334255" strokeWidth="2" />
          <path d="M24 52l5-12h24l5 12z" fill="#8ea6c0" stroke="#334255" strokeWidth="2" />
          <path d="M15 40l5-12h24l5 12z" fill="#b2c4d8" stroke="#334255" strokeWidth="2" />
          <path d="M22 31h18" stroke="#fff" strokeOpacity=".6" strokeWidth="2" />
        </svg>
      );
    case 'medicine':
      return (
        <svg {...common}>
          <rect x="8" y="22" width="44" height="34" rx="4" fill="#efe8da" stroke="#6a6256" strokeWidth="2" />
          <rect x="22" y="31" width="16" height="16" rx="2" fill="#d44a43" />
          <path d="M30 34v10M25 39h10" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
          <rect x="42" y="6" width="12" height="22" rx="4" fill="#4aa98a" stroke="#1f5c4a" strokeWidth="2" />
          <rect x="44" y="2" width="8" height="6" rx="2" fill="#e8e1d0" stroke="#6a6256" strokeWidth="1.5" />
        </svg>
      );
    case 'chips':
      return (
        <svg {...common}>
          <g stroke="#d9b45a" strokeWidth="3" strokeLinecap="round">
            {[16, 24, 32, 40, 48].map((p) => (
              <g key={p}>
                <path d={`M${p} 8v8M${p} 48v8`} />
                <path d={`M8 ${p}h8M48 ${p}h8`} />
              </g>
            ))}
          </g>
          <rect x="14" y="14" width="36" height="36" rx="4" fill="#1f5e55" stroke="#0e2f2a" strokeWidth="2" />
          <rect x="22" y="22" width="20" height="20" rx="2" fill="#0f1c1a" stroke="#3fc3a3" strokeWidth="1.5" />
          <circle cx="26" cy="26" r="1.8" fill="#3fc3a3" />
        </svg>
      );
  }
}

export function Lantern({ size = 56, glow = true, className = '' }: { size?: number; glow?: boolean; className?: string }) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" className={`sway ${className}`} aria-hidden>
      {glow && <circle cx="20" cy="30" r="19" fill="#f4b24a" opacity=".22" className="flicker" />}
      <path d="M20 0v8" stroke="#8a6428" strokeWidth="2" />
      <path d="M12 12h16l-3-5h-10z" fill="#8a6428" />
      <rect x="11" y="12" width="18" height="30" rx="5" fill="#f4b24a" fillOpacity=".5" stroke="#c19a52" strokeWidth="2" />
      <ellipse cx="20" cy="30" rx="4" ry="7" fill="#ffd98a" className="flicker" />
      <path d="M13 44h14l-2 5H15z" fill="#8a6428" />
    </svg>
  );
}

export function Purse({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M13 8c2 3 12 3 14 0l-2-4H15z" fill="#8a5d33" stroke="#4a2f17" strokeWidth="1.5" />
      <path d="M12 10c-7 6-9 12-8 19 1 6 7 8 16 8s15-2 16-8c1-7-1-13-8-19-3 2-13 2-16 0z" fill="#a8743f" stroke="#4a2f17" strokeWidth="2" />
      <circle cx="20" cy="26" r="6" fill="#f4b24a" stroke="#8a6428" strokeWidth="1.5" />
      <path d="M20 22v8M17.5 24.5h5" stroke="#8a6428" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function WaxSeal({ size = 44, children, className = '' }: { size?: number; children?: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 48 48" className="absolute inset-0" aria-hidden>
        <path
          d="M24 2c4 0 5 3 9 3s6 3 7 7 4 5 4 9-3 5-4 9-3 7-7 8-5 4-9 4-5-3-9-4-6-4-7-8-4-5-4-9 3-5 4-9 3-6 7-7 5-3 9-3z"
          fill="#a82a20"
          stroke="#5e130c"
          strokeWidth="1.5"
        />
        <circle cx="24" cy="24" r="14" fill="none" stroke="#d9594a" strokeWidth="1.5" opacity=".7" />
      </svg>
      <span className="relative text-[#ffd8c9] font-black" style={{ fontSize: size * 0.42 }}>
        {children ?? '✓'}
      </span>
    </span>
  );
}

export function Trend({ dir, label, size = 'md' }: { dir: 'up' | 'down'; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = dir === 'up' ? 'text-mosslight' : 'text-waxlight';
  const sz = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-base';
  return (
    <span className={`inline-flex items-center gap-1 font-extrabold ${cls} ${sz}`}>
      <span aria-hidden>{dir === 'up' ? '▲' : '▼'}</span>
      <span>{label ?? (dir === 'up' ? 'بالا' : 'پایین')}</span>
    </span>
  );
}

/** Counting number (odometer-like). */
export function AnimatedNumber({ value, from, duration = 0.9, className = '', group = true }: { value: number; from?: number; duration?: number; className?: string; group?: boolean }) {
  const [shown, setShown] = useState(from ?? value);
  const prev = useRef(from ?? value);
  useEffect(() => {
    const c = animate(prev.current, value, { duration, ease: 'easeOut', onUpdate: (v) => setShown(v) });
    prev.current = value;
    return () => c.stop();
  }, [value, duration]);
  return <span className={`tabular-nums ${className}`}>{toFa(Math.round(shown), group)}</span>;
}

/** Burning fuse countdown. */
export function Fuse({ left, total, paused = false, tick = true, className = '' }: { left: number; total: number; paused?: boolean; tick?: boolean; className?: string }) {
  const frac = Math.max(0, Math.min(1, left / total));
  const urgent = left <= 5 && left > 0 && !paused;
  const lastTick = useRef(-1);
  useEffect(() => {
    if (tick && urgent && lastTick.current !== left) {
      lastTick.current = left;
      sfx.tick();
    }
  }, [left, urgent, tick]);
  return (
    <div className={`relative h-6 ${className}`} role="timer" aria-label={`${left}`}>
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-black/40" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-[width] duration-300 ease-linear"
        style={{ right: 0, width: `${frac * 100}%`, background: 'repeating-linear-gradient(90deg,#c19a52 0 6px,#8a6428 6px 10px)' }}
      />
      <div className={`absolute top-1/2 -translate-y-1/2 transition-[right] duration-300 ease-linear ${urgent ? 'pulse-soft' : ''}`} style={{ right: `calc(${frac * 100}% - 10px)` }}>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="flicker">
          <circle cx="11" cy="11" r="10" fill="#ff9f2e" opacity=".35" />
          <path d="M11 2c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-3 2-5 1 2 2 2 2 2 0-3 0-5 2-7z" fill="#ffd27a" stroke="#e0832b" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${toFa(m, false)}:${toFa(String(r).padStart(2, '0'), false)}`;
}

/** 12 visible warehouse slots filled with tiny crates. */
export function Warehouse({ inventory, goods, capacity = 12, small = false }: { inventory: Record<Good, number>; goods: Good[]; capacity?: number; small?: boolean }) {
  const slots: (Good | null)[] = [];
  for (const g of goods) for (let i = 0; i < (inventory[g] ?? 0); i++) slots.push(g);
  while (slots.length < capacity) slots.push(null);
  const used = capacity - slots.filter((s) => s === null).length;
  return (
    <div aria-label={`${used}/${capacity}`}>
      <div className={`grid grid-cols-6 gap-1 ${small ? 'w-40' : 'w-full'}`}>
        {slots.slice(0, capacity).map((g, i) => (
          <div
            key={i}
            className={`aspect-square rounded-[5px] grid place-items-center border ${g ? 'border-[#2f1f10] bg-[#6b4a2b]' : 'border-dashed border-white/15 bg-white/[0.03]'}`}
            title={g ?? ''}
          >
            {g && <GoodIcon good={g} size={small ? 20 : 26} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="grid place-items-center gap-3 py-16 text-fog">
      <Lantern size={44} />
      <p className="font-bold">{label}</p>
    </div>
  );
}
