'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { Good } from '../engine/config';
import { DIRECTION_ARROWS, DIRECTION_NAMES, describeClue, describeContract, describeNews, goodName, toFa } from '../engine/describe';
import type { Claim, ClaimEval, Clue, Contract, PublicNews } from '../engine/types';
import { fa } from '../i18n/fa';
import { sfx, buzz } from '../lib/sound';
import { AnimatedNumber, GoodIcon, WaxSeal } from './art';

export function usePrevious<T>(v: T): T | undefined {
  const r = useRef<T | undefined>(undefined);
  const [p, setP] = useState<T | undefined>(undefined);
  useEffect(() => {
    if (r.current !== v) {
      setP(r.current);
      r.current = v;
    }
  }, [v]);
  return p;
}

/** Chalkboard price tag with an up/down arrow that pops when the price changes. */
export function PriceTag({ price, size = 'md' }: { price: number; size?: 'md' | 'lg' }) {
  const prev = usePrevious(price);
  const dir = prev === undefined || prev === price ? null : price > prev ? 'up' : 'down';
  return (
    <span className={`chalk inline-flex items-center gap-1.5 px-2.5 py-0.5 font-black tabular-nums ${size === 'lg' ? 'text-3xl px-4 py-1' : 'text-base'}`}>
      <AnimatedNumber value={price} duration={0.7} />
      <AnimatePresence mode="wait">
        {dir && (
          <motion.span key={`${price}-${dir}`} initial={{ y: dir === 'up' ? 10 : -10, opacity: 0, scale: 0.5 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className={dir === 'up' ? 'text-mosslight' : 'text-waxlight'} aria-label={DIRECTION_NAMES[dir]}>
            {DIRECTION_ARROWS[dir]}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function NewsCard({ news, big = false }: { news: PublicNews; big?: boolean }) {
  return (
    <div className={`paper ${big ? 'p-8' : 'p-4'}`}>
      <p className={`font-black tracking-wide text-copper ${big ? 'text-2xl' : 'text-xs'}`}>📜 {fa.info.news}</p>
      <p className={`mt-1 font-extrabold ${big ? 'text-4xl leading-[3.5rem]' : 'text-lg leading-8'}`}>{describeNews(news)}</p>
    </div>
  );
}

export function ContractCard({ contract, auction, big = false }: { contract: Contract; auction: boolean; big?: boolean }) {
  return (
    <div className={`paper p-4 ${big ? 'p-6' : ''}`}>
      <div className="flex items-start gap-3">
        <GoodIcon good={contract.good} size={big ? 72 : 48} />
        <div>
          <p className="text-xs font-black text-copper">⚖ {auction ? fa.info.contractAuction : fa.info.contract}</p>
          <p className={`font-extrabold leading-8 ${big ? 'text-3xl leading-[3rem]' : 'text-lg'}`}>{describeContract(contract)}</p>
          <p className={`text-ink/70 ${big ? 'text-xl' : 'text-sm'}`}>{auction ? fa.info.contractAuctionDesc : fa.info.contractAnnounceDesc}</p>
        </div>
      </div>
    </div>
  );
}

/** A clue as a parchment letter. Bought clues carry a red wax "verified" seal. */
export function ClueCardView({ clue, verifiedFrom, className = '' }: { clue: Clue; verifiedFrom?: string; className?: string }) {
  return (
    <div className={`paper p-4 ${className}`}>
      <div className="flex items-start gap-3">
        {verifiedFrom !== undefined && (
          <div className="shrink-0">
            <WaxSeal size={46} />
          </div>
        )}
        <div className="min-w-0">
          {verifiedFrom !== undefined && (
            <p className="text-xs font-black text-wax">
              {fa.market.verified}
              {verifiedFrom ? ` · ${verifiedFrom}` : ''}
            </p>
          )}
          <p className="text-lg font-extrabold leading-8">{describeClue(clue)}</p>
        </div>
      </div>
    </div>
  );
}

/** Sealed letter: tap to tear it open. */
export function ClueLetter({ clue, storageKey }: { clue: Clue; storageKey: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(window.sessionStorage.getItem(storageKey) === '1');
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  const tear = () => {
    setOpen(true);
    sfx.tear();
    buzz([10, 30, 10]);
    try {
      window.sessionStorage.setItem(storageKey, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div>
      <p className="mb-2 text-sm font-black text-brass">✉ {fa.info.yourClue}</p>
      <AnimatePresence mode="wait" initial={false}>
        {!open ? (
          <motion.button key="closed" type="button" onClick={tear} exit={{ rotateX: 90, opacity: 0 }} className="paper relative grid h-40 w-full place-items-center overflow-hidden" aria-label={fa.info.tear}>
            <svg className="absolute inset-0 size-full" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden>
              <path d="M0 0l100 55L200 0" fill="none" stroke="#8a6a38" strokeWidth="1.2" opacity=".6" />
              <path d="M0 100l75-45M200 100l-75-45" stroke="#8a6a38" strokeWidth="1" opacity=".5" />
            </svg>
            <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} className="relative">
              <WaxSeal size={64}>؟</WaxSeal>
            </motion.span>
            <span className="relative text-sm font-black text-ink/80">{fa.info.tear}</span>
          </motion.button>
        ) : (
          <motion.div key="open" initial={{ rotateX: -80, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }}>
            <ClueCardView clue={clue} />
            <p className="mt-2 text-xs text-fog">{fa.info.clueTruth}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ClaimNotice({ claim, name, evalr, big = false }: { claim: Pick<Claim, 'good' | 'direction'>; name: string; evalr?: ClaimEval; big?: boolean }) {
  const verdict = evalr ? fa.reveal[evalr.net] : null;
  const tone = evalr ? (evalr.net === 'true' ? 'text-moss' : evalr.net === 'mixed' ? 'text-copper' : 'text-wax') : '';
  return (
    <motion.div layout initial={{ scale: 0.7, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: ((name.length % 5) - 2) * 0.9, opacity: 1 }} className={`paper relative ${big ? 'p-5' : 'p-3'}`}>
      <span className="absolute -top-2 start-4 size-3.5 rounded-full bg-wax shadow-md" aria-hidden />
      <div className="flex items-center gap-3">
        <GoodIcon good={claim.good} size={big ? 56 : 36} />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-black ${big ? 'text-2xl' : 'text-sm'}`}>{name}</p>
          <p className={`font-extrabold ${big ? 'text-xl' : 'text-base'} ${claim.direction === 'up' ? 'text-moss' : 'text-wax'}`}>
            {goodName(claim.good)} {DIRECTION_ARROWS[claim.direction]} {claim.direction === 'up' ? fa.market.claimUp : fa.market.claimDown}
          </p>
        </div>
        {verdict && <span className={`stamp ${tone} ${big ? 'text-2xl' : 'text-sm'}`}>{verdict}</span>}
      </div>
    </motion.div>
  );
}

export function GoodsRow({ goods, prices }: { goods: Good[]; prices: Record<Good, number> }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {goods.map((g) => (
        <div key={g} className="plank flex shrink-0 flex-col items-center gap-1 px-2.5 py-2">
          <GoodIcon good={g} size={34} />
          <span className="text-xs font-bold text-paper">{goodName(g)}</span>
          <PriceTag price={prices[g]} />
        </div>
      ))}
    </div>
  );
}

export function nameMap(players: { id: string; nickname: string }[]): Record<string, string> {
  return Object.fromEntries(players.map((p) => [p.id, p.nickname]));
}

export { toFa };
