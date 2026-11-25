import { describe, expect, it } from 'vitest';
import { parseSplit } from '../src/utils/split.js';
import { parsePaymentMethod } from '../src/utils/payment.js';
import { extractTags } from '../src/utils/tags.js';
import { monthRange, previousYearMonth } from '../src/utils/date.js';
import { signToken, verifyToken } from '../src/utils/jwt.js';

describe('parseSplit (공동/개인 + 분담 비율 검증)', () => {
  it('아무것도 안 주면 공동 1:1', () => {
    expect(parseSplit({})).toEqual({ ok: true, value: { splitType: 'shared', payerSharePercent: 50 } });
  });
  it('개인 지출은 비율을 100으로 고정한다', () => {
    expect(parseSplit({ splitType: 'personal', payerSharePercent: 30 })).toEqual({
      ok: true,
      value: { splitType: 'personal', payerSharePercent: 100 },
    });
  });
  it.each([0, 100, 55.5, -1])('공동 지출 비율 %s은(는) 거절', (percent) => {
    expect(parseSplit({ splitType: 'shared', payerSharePercent: percent }).ok).toBe(false);
  });
  it('모르는 구분값은 거절', () => {
    expect(parseSplit({ splitType: 'half' }).ok).toBe(false);
  });
});

describe('parsePaymentMethod', () => {
  it.each([undefined, null, ''])('%s → 미지정(null)', (v) => {
    expect(parsePaymentMethod(v)).toEqual({ ok: true, value: null });
  });
  it('허용된 결제수단', () => expect(parsePaymentMethod('naverpay')).toEqual({ ok: true, value: 'naverpay' }));
  it('그 외는 거절', () => expect(parsePaymentMethod('bitcoin').ok).toBe(false));
});

describe('extractTags', () => {
  it('메모 속 #태그, 중복 제거', () => expect(extractTags('흑돼지 #제주 #데이트 #제주')).toEqual(['제주', '데이트']));
  it('메모가 없으면 빈 배열', () => expect(extractTags(null)).toEqual([]));
});

describe('date utils', () => {
  it('monthRange는 [이번 달 1일, 다음 달 1일) — 연말도 넘어간다', () => {
    expect(monthRange('2026-11')).toEqual(['2026-11-01', '2026-12-01']);
    expect(monthRange('2026-12')).toEqual(['2026-12-01', '2027-01-01']);
  });
  it('previousYearMonth는 연초에 작년 12월', () => {
    expect(previousYearMonth('2026-01')).toBe('2025-12');
  });
});

describe('JWT', () => {
  it('발급한 토큰을 다시 읽으면 userId가 나온다', () => {
    expect(verifyToken(signToken({ userId: 7 })).userId).toBe(7);
  });
  it('위조된 토큰은 거절', () => {
    const token = signToken({ userId: 7 });
    expect(() => verifyToken(token.slice(0, -2) + 'xx')).toThrow();
  });
});
