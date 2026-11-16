'use client';
// Sound effects generated with the Web Audio API (no asset files), plus light haptics.

let ctx: AudioContext | null = null;
let muted = false;
const listeners = new Set<() => void>();

try {
  muted = typeof window !== 'undefined' && window.localStorage.getItem('wm:muted') === '1';
} catch {
  /* storage unavailable */
}

export function isMuted() {
  return muted;
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    window.localStorage.setItem('wm:muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export function subscribeMute(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, delay = 0, slideTo?: number) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.1, delay = 0, hp = 1500) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  coin() {
    tone(1318, 0.12, 'triangle', 0.1);
    tone(1760, 0.22, 'triangle', 0.09, 0.07);
  },
  stamp() {
    tone(110, 0.16, 'square', 0.14, 0, 55);
    noise(0.08, 0.08, 0, 600);
  },
  tear() {
    noise(0.35, 0.12, 0, 2500);
  },
  hiss() {
    noise(0.25, 0.05, 0, 4000);
  },
  tick() {
    tone(900, 0.04, 'square', 0.04);
  },
  flip() {
    tone(420, 0.1, 'triangle', 0.08, 0, 700);
  },
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, i * 0.12));
  },
  bad() {
    tone(220, 0.35, 'sawtooth', 0.07, 0, 110);
  },
  turn() {
    tone(660, 0.12, 'sine', 0.12);
    tone(880, 0.2, 'sine', 0.12, 0.12);
  },
};

export function buzz(ms: number | number[] = 12) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* unsupported */
  }
}
