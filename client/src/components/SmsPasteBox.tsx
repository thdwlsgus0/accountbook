import { useState } from 'react';
import { ParsedSms, parseSms } from '../utils/smsParser';
import { formatCurrency } from '../utils/format';
import { paymentMethodLabel } from '../utils/payment';

interface SmsPasteBoxProps {
  // 문자를 읽을 때마다 결과를 넘긴다. 읽은 항목만 입력칸에 채우는 건 부모(QuickAddForm)가 한다.
  onParsed: (result: ParsedSms) => void;
}

// 카드 승인 문자 / 네이버페이 알림을 붙여넣으면 바로 읽어서 빠른 입력 칸을 채운다.
// 해석은 브라우저에서만 하고 문자 원문은 서버로 보내지 않는다(카드 번호 일부, 이름 등이 들어 있어서).
export default function SmsPasteBox({ onParsed }: SmsPasteBoxProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParsedSms | null>(null);

  function handleChange(value: string) {
    setText(value);
    if (!value.trim()) {
      setResult(null);
      return;
    }
    const parsed = parseSms(value);
    setResult(parsed);
    onParsed(parsed);
  }

  if (!open) {
    return (
      <button type="button" className="sms-toggle" onClick={() => setOpen(true)}>
        📩 카드 문자 붙여넣기
      </button>
    );
  }

  const missing = result
    ? [
        result.amount == null && '금액',
        result.merchant == null && '가게',
        result.occurredOn == null && '날짜',
      ].filter(Boolean)
    : [];

  return (
    <div className="sms-paste">
      <div className="sms-paste-header">
        <span className="small">카드 승인 문자나 네이버페이 결제 알림을 그대로 붙여넣으세요.</span>
        <button
          type="button"
          className="sms-close"
          aria-label="문자 붙여넣기 닫기"
          onClick={() => {
            setOpen(false);
            setText('');
            setResult(null);
          }}
        >
          ×
        </button>
      </div>
      <textarea
        id="sms-paste-input"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={'[Web발신]\n신한카드(1234)승인\n홍*동\n12,500원 일시불\n11/17 14:02 스타벅스'}
        rows={4}
        spellCheck={false}
        autoFocus
      />
      {result && (
        <>
          {result.isCancel && (
            <p className="error">승인 취소 문자예요. 이미 기록한 지출이 있다면 전체 내역에서 지워주세요.</p>
          )}
          <p className="sms-result">
            {result.amount != null && <span>{formatCurrency(result.amount)}</span>}
            {result.merchant && <span>{result.merchant}</span>}
            {result.occurredOn && <span>{result.occurredOn.slice(5).replace('-', '/')}</span>}
            {result.paymentMethod && <span>{paymentMethodLabel(result.paymentMethod)}</span>}
          </p>
          <p className="muted small">
            {missing.length > 0
              ? `${missing.join(', ')}은(는) 못 읽었어요. 아래 칸에 직접 채워주세요.`
              : '아래 칸에 채워뒀어요. 확인하고 "기록하기"를 눌러주세요.'}
          </p>
        </>
      )}
    </div>
  );
}
