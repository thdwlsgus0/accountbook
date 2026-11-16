// 지출 결제수단. 수입이나 예전에 기록한 내역처럼 결제수단을 고르지 않은 건 null("미지정").
export const PAYMENT_METHODS = ['card', 'cash', 'naverpay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: '카드',
  cash: '현금',
  naverpay: '네이버페이',
};

export type ParsePaymentResult = { ok: true; value: PaymentMethod | null } | { ok: false; message: string };

// 비어 있으면(undefined/null/'') 미지정으로 보고, 값이 있으면 허용된 결제수단인지 확인한다.
export function parsePaymentMethod(value: unknown): ParsePaymentResult {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)) {
    return { ok: true, value: value as PaymentMethod };
  }
  return { ok: false, message: '결제수단은 카드, 현금, 네이버페이 중에서 골라주세요.' };
}
