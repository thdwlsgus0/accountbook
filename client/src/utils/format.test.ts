import { describe, expect, it } from 'vitest';
import { formatCompactCurrency, formatCurrency, localDateString, splitBadgeLabel } from './format';

describe('splitBadgeLabel', () => {
  it('개인 지출은 "개인"', () => expect(splitBadgeLabel('personal', 100)).toBe('개인'));
  it('1:1 공동 지출은 배지 없음', () => expect(splitBadgeLabel('shared', 50)).toBeNull());
  it('그 외 비율은 "6:4" 형식', () => expect(splitBadgeLabel('shared', 60)).toBe('6:4'));
});

describe('formatCurrency / formatCompactCurrency', () => {
  it('천 단위 쉼표와 "원"', () => expect(formatCurrency(1234567)).toBe('1,234,567원'));
  it('1만원 이상은 "만"으로 줄인다', () => expect(formatCompactCurrency(35000)).toBe('3.5만'));
  it('1만원 미만은 그대로', () => expect(formatCompactCurrency(9500)).toBe('9,500'));
});

describe('localDateString', () => {
  it('UTC가 아니라 기기 시간대 기준 날짜를 쓴다', () => {
    // 자정 직후(현지 시간)를 만들어도 그 날짜가 그대로 나와야 한다.
    expect(localDateString(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(localDateString(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
