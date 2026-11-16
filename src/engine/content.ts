// Event templates (Persian flavor text). Direction is fixed per template; targets list plausible goods.
import type { Good } from './config';
import type { Direction } from './types';

export interface EventTemplate {
  id: string;
  text: string;
  direction: Direction;
  targets: Good[];
}

const ALL: Good[] = ['wheat', 'fuel', 'iron', 'medicine', 'chips'];

export const EVENT_TEMPLATES: EventTemplate[] = [
  // ---- گندم
  { id: 'wheat-drought', text: 'خشکسالی محصول گندم جنوب را سوزاند', direction: 'up', targets: ['wheat'] },
  { id: 'wheat-storm', text: 'کشتی‌های غله در طوفان گرفتار شدند', direction: 'up', targets: ['wheat'] },
  { id: 'wheat-bakers', text: 'نانوایی‌های بندر سفارش عمده دادند', direction: 'up', targets: ['wheat'] },
  { id: 'wheat-glut', text: 'انبارهای گندم از محصول سرشار شد', direction: 'down', targets: ['wheat'] },
  { id: 'wheat-cheap', text: 'محمولهٔ ارزان گندم از دریا رسید', direction: 'down', targets: ['wheat'] },
  // ---- سوخت
  { id: 'fuel-strike', text: 'اعتصاب در پالایشگاه', direction: 'up', targets: ['fuel'] },
  { id: 'fuel-seized', text: 'ناوگان قاچاق سوخت توقیف شد', direction: 'up', targets: ['fuel'] },
  { id: 'fuel-winter', text: 'زمستان زودرس رسید و بخاری‌ها روشن شد', direction: 'up', targets: ['fuel'] },
  { id: 'fuel-field', text: 'چاه نفت تازه‌ای در ساحل کشف شد', direction: 'down', targets: ['fuel'] },
  { id: 'fuel-tanker', text: 'تانکر عظیم سوخت در بندر پهلو گرفت', direction: 'down', targets: ['fuel'] },
  // ---- آهن
  { id: 'iron-build', text: 'قرارداد ساخت‌وساز بزرگ امضا شد', direction: 'up', targets: ['iron'] },
  { id: 'iron-shipyard', text: 'کارگاه کشتی‌سازی سفارش تازه گرفت', direction: 'up', targets: ['iron'] },
  { id: 'iron-south', text: 'محمولهٔ آهن از جنوب رسید', direction: 'down', targets: ['iron'] },
  { id: 'iron-mine', text: 'معدن قدیمی دوباره باز شد', direction: 'down', targets: ['iron'] },
  // ---- دارو
  { id: 'med-plague', text: 'بیماری ناشناخته‌ای در محله‌های بندر پیچید', direction: 'up', targets: ['medicine'] },
  { id: 'med-customs', text: 'گمرک داروهای وارداتی را توقیف کرد', direction: 'up', targets: ['medicine'] },
  { id: 'med-sale', text: 'داروخانهٔ بزرگ حراج زمستانی گذاشت', direction: 'down', targets: ['medicine'] },
  { id: 'med-factory', text: 'کارخانهٔ داروسازی تولیدش را دو برابر کرد', direction: 'down', targets: ['medicine'] },
  // ---- تراشه
  { id: 'chips-shortage', text: 'کمبود جهانی تراشه شدت گرفت', direction: 'up', targets: ['chips'] },
  { id: 'chips-fire', text: 'آتش‌سوزی در کارخانهٔ تراشه', direction: 'up', targets: ['chips'] },
  { id: 'chips-leak', text: 'انبار قاچاق تراشه لو رفت و به بازار سرازیر شد', direction: 'down', targets: ['chips'] },
  { id: 'chips-tech', text: 'فناوری تازه ساخت تراشه را ارزان کرد', direction: 'down', targets: ['chips'] },
  // ---- عمومی
  { id: 'gen-blockade', text: 'شایعهٔ محاصرهٔ دریایی در بندر پیچید', direction: 'up', targets: ALL },
  { id: 'gen-sunk', text: 'کشتی باری بزرگی در مه غرق شد', direction: 'up', targets: ALL },
  { id: 'gen-quarantine', text: 'گمرک بندر برای چند روز بسته شد', direction: 'up', targets: ALL },
  { id: 'gen-rich', text: 'تاجران ثروتمند خارجی وارد بندر شدند', direction: 'up', targets: ALL },
  { id: 'gen-festival', text: 'جشن بزرگ بندر شروع شد و همه خرید می‌کنند', direction: 'up', targets: ALL },
  { id: 'gen-captain', text: 'ناخدای مشهوری با کشتی پر از کالا لنگر انداخت', direction: 'down', targets: ALL },
  { id: 'gen-flood', text: 'سیل کالای ارزان از بازار سیاه سرازیر شد', direction: 'down', targets: ALL },
  { id: 'gen-bribe', text: 'بازرسان گمرک رشوه گرفتند و در را باز گذاشتند', direction: 'down', targets: ALL },
  { id: 'gen-fog', text: 'مه غلیظ معامله‌ها را فلج کرد و فروشنده‌ها ترسیدند', direction: 'down', targets: ALL },
  { id: 'gen-pirates', text: 'دزدان دریایی انبار یک تاجر را غارت کردند', direction: 'up', targets: ALL },
  { id: 'gen-tax', text: 'مالیات تازهٔ بندر برداشته شد', direction: 'down', targets: ALL },
  { id: 'gen-wedding', text: 'عروسی پرجمعیت در بندر برگزار شد', direction: 'up', targets: ['wheat', 'fuel', 'medicine'] },
  { id: 'gen-fleet', text: 'ناوگان تازه‌ای به بندر پیوست', direction: 'down', targets: ['fuel', 'iron', 'chips'] },
];
