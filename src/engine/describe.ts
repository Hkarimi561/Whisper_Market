// Persian text helpers shared by the engine, server and UI.
import type { Good } from './config';
import type { Clue, Component, Contract, Direction, Magnitude, PublicNews } from './types';

export const GOOD_NAMES: Record<Good, string> = {
  wheat: 'گندم',
  fuel: 'سوخت',
  iron: 'آهن',
  medicine: 'دارو',
  chips: 'تراشه',
};

export const DIRECTION_NAMES: Record<Direction, string> = { up: 'بالا', down: 'پایین' };
export const DIRECTION_ARROWS: Record<Direction, string> = { up: '▲', down: '▼' };
export const MAGNITUDE_NAMES: Record<Magnitude, string> = { low: 'کم', medium: 'متوسط', high: 'شدید' };
export const COMPONENT_NAMES: Record<Component, string> = { target: 'کالا', direction: 'جهت', magnitude: 'شدت' };

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
/** Persian digits with thousands separator. */
export function toFa(n: number | string, group = true): string {
  if (n === undefined || n === null || (typeof n === 'number' && !Number.isFinite(n))) return '؟';
  const s = typeof n === 'number' ? (group ? Math.round(n).toLocaleString('en-US') : String(Math.round(n))) : n;
  return s.replace(/\d/g, (d) => FA_DIGITS[+d]).replace(/,/g, '٬');
}

export function goodName(g: Good): string {
  return GOOD_NAMES[g];
}

export function describeNews(news: PublicNews): string {
  if (news.component === 'target' && news.target) return `امروز رویدادی روی ${goodName(news.target)} هست.`;
  if (news.component === 'direction' && news.direction)
    return news.direction === 'up'
      ? 'امروز رویدادی قیمت یکی از کالاها را بالا می‌برد.'
      : 'امروز رویدادی قیمت یکی از کالاها را پایین می‌آورد.';
  if (news.component === 'magnitude' && news.magnitude) {
    if (news.magnitude === 'high') return 'امروز رویدادی شدید در بازار در جریان است.';
    if (news.magnitude === 'medium') return 'امروز رویدادی متوسط در بازار در جریان است.';
    return 'امروز رویدادی کوچک در بازار در جریان است.';
  }
  return 'امروز خبری در بازار هست.';
}

/** Full text of a clue as the owner reads it. */
export function describeClue(c: Clue): string {
  if (c.kind === 'count') {
    const g = c.countGood ? goodName(c.countGood) : '؟';
    if (!c.count) return `هیچ رویدادی روی ${g} اثر ندارد.`;
    return `${toFa(c.count)} رویداد روی ${g} اثر دارد.`;
  }
  const t = c.target ? goodName(c.target) : null;
  const d = c.direction;
  const m = c.magnitude;
  if (t && d) return `رویدادی ${t} را ${d === 'up' ? 'بالا می‌برد' : 'پایین می‌آورد'} (شدتش معلوم نیست).`;
  if (t && m) return `رویدادی ${MAGNITUDE_NAMES[m]} روی ${t} هست (جهتش معلوم نیست).`;
  if (d && m)
    return `رویدادی ${MAGNITUDE_NAMES[m]} قیمت یک کالا را ${d === 'up' ? 'بالا می‌برد' : 'پایین می‌آورد'} (کالایش معلوم نیست).`;
  return 'سرنخی مبهم.';
}

export interface CluePreview {
  topic: Good | null;
  includes: Component[];
}

/** What a buyer may see before paying: topic (good) and which kinds of information are inside. */
export function cluePreview(c: Clue): CluePreview {
  if (c.kind === 'count') return { topic: c.countGood ?? null, includes: ['magnitude'] };
  const topic = c.target ?? null;
  const includes: Component[] = [];
  if (c.direction) includes.push('direction');
  if (c.magnitude) includes.push('magnitude');
  return { topic, includes };
}

export function describePreview(p: CluePreview, isCount = false): string {
  const topic = p.topic ? goodName(p.topic) : 'نامعلوم';
  if (isCount) return `موضوع: ${topic} · شامل: تعداد رویدادها`;
  const inc = p.includes.map((i) => COMPONENT_NAMES[i]).join(' و ');
  return `موضوع: ${topic} · شامل: ${inc}`;
}

export function describeContract(c: Contract): string {
  return `${CONTRACT_BUYERS[c.good]} ${toFa(c.quantity)} ${goodName(c.good)} را به ${toFa(c.unitPrice)} می‌خرد`;
}

const CONTRACT_BUYERS: Record<Good, string> = {
  wheat: 'نانوایی بزرگ',
  fuel: 'ناوگان شاه‌دریا',
  iron: 'کارگاه کشتی‌سازی',
  medicine: 'بیمارستان',
  chips: 'آزمایشگاه مخفی',
};
