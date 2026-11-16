import { PaymentMethod } from '../types';
import { readDismissed, writeDismissed } from './storage';

// 서버 server/src/utils/payment.ts의 PAYMENT_METHODS와 순서·값을 맞춘다.
export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'card', label: '카드', icon: '💳' },
  { value: 'cash', label: '현금', icon: '💵' },
  { value: 'naverpay', label: '네이버페이', icon: '🟢' },
];

export function paymentMethodLabel(method: PaymentMethod | null): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? '미지정';
}

// 빠른 입력에서 마지막으로 쓴 결제수단을 기억해서 다음에 기본으로 골라둔다 (대부분 늘 같은 걸 쓰니까).
const LAST_METHOD_KEY = 'lastPaymentMethod';

export function readLastPaymentMethod(): PaymentMethod {
  const saved = readDismissed(LAST_METHOD_KEY);
  return PAYMENT_METHODS.some((m) => m.value === saved) ? (saved as PaymentMethod) : 'card';
}

export function writeLastPaymentMethod(method: PaymentMethod) {
  writeDismissed(LAST_METHOD_KEY, method);
}
