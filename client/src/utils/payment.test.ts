import { describe, expect, it } from 'vitest';
import { paymentMethodLabel, readLastPaymentMethod, writeLastPaymentMethod } from './payment';

describe('paymentMethodLabel', () => {
  it('결제수단 이름', () => {
    expect(paymentMethodLabel('card')).toBe('카드');
    expect(paymentMethodLabel('naverpay')).toBe('네이버페이');
  });
  it('고르지 않았으면 "미지정"', () => expect(paymentMethodLabel(null)).toBe('미지정'));
});

describe('마지막으로 쓴 결제수단 기억', () => {
  it('처음엔 카드', () => expect(readLastPaymentMethod()).toBe('card'));

  it('쓴 결제수단을 기억한다', () => {
    writeLastPaymentMethod('naverpay');
    expect(readLastPaymentMethod()).toBe('naverpay');
  });

  it('저장된 값이 이상하면 카드로 돌아간다', () => {
    localStorage.setItem('lastPaymentMethod', 'bitcoin');
    expect(readLastPaymentMethod()).toBe('card');
  });
});
