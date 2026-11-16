import { PaymentMethod } from '../types';
import { PAYMENT_METHODS } from '../utils/payment';

interface PaymentMethodPickerProps {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod | null) => void;
  // 이미 고른 걸 다시 누르면 "미지정"으로 되돌릴 수 있게 할지 (예전 내역 수정용)
  allowClear?: boolean;
}

// 결제수단(카드/현금/네이버페이) 선택. 빠른 입력, 내역 수정에서 같이 쓴다.
export default function PaymentMethodPicker({ value, onChange, allowClear = false }: PaymentMethodPickerProps) {
  return (
    <div className="type-toggle payment-picker" role="group" aria-label="결제수단">
      {PAYMENT_METHODS.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            className={active ? 'active payment' : ''}
            aria-pressed={active}
            onClick={() => onChange(active && allowClear ? null : m.value)}
          >
            {m.icon} {m.label}
          </button>
        );
      })}
    </div>
  );
}
