import { describe, expect, it } from 'vitest';
import { isDishStore } from './dishes';
import { StoreType } from './enums';
describe('dish discovery eligibility', () => {
  it('uses explicit classification even when a name suggests something else', () => {
    for (const storeType of Object.values(StoreType)) {
      expect(isDishStore({ nameAr: 'مطعم ومقهى', nameEn: '', storeType })).toBe(['RESTAURANT', 'CAFE', 'BAKERY_SWEETS'].includes(storeType));
    }
    expect(isDishStore({ nameAr: 'البركة', nameEn: '', storeType: 'CAFE' })).toBe(true);
  });
  it('recognizes legacy food stores and excludes unknown or grocery names', () => {
    for (const nameAr of ['مطعم القدس', 'مقهى البلد', 'كافيه السموع', 'حلويات الشام', 'مخابز النور']) {
      expect(isDishStore({ nameAr, nameEn: '', storeType: null })).toBe(true);
    }
    for (const nameAr of ['بقالة القهوة', 'سوبرماركت الحلويات', 'متجر البركة']) {
      expect(isDishStore({ nameAr, nameEn: '', storeType: null })).toBe(false);
    }
  });
});
