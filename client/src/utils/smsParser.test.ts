import { describe, expect, it } from 'vitest';
import { parseSms } from './smsParser';

// 문자엔 연도가 없어서 "오늘"을 고정해야 결과가 매번 같다.
const NOW = new Date(2026, 10, 19, 12, 0); // 2026-11-19

const cases: Array<[string, string, Partial<ReturnType<typeof parseSms>>]> = [
  [
    '신한카드 여러 줄',
    '[Web발신]\n신한카드(1234)승인\n홍*동\n12,500원 일시불\n11/17 14:02 스타벅스 강남점\n누적1,204,300원',
    { amount: 12500, occurredOn: '2026-11-17', merchant: '스타벅스 강남점', paymentMethod: 'card', isCancel: false },
  ],
  [
    '신한카드 한 줄로 붙은 문자',
    '[Web발신] 신한카드(1234)승인 홍*동 12,500원(일시불)11/17 14:02 스타벅스 누적1,204,300원',
    { amount: 12500, occurredOn: '2026-11-17', merchant: '스타벅스', paymentMethod: 'card' },
  ],
  [
    'KB국민카드 (가게가 시각 다음 줄)',
    '[Web발신]\nKB국민카드3*7*승인\n홍*동님\n64,000원 일시불\n11/15 19:40\n아웃백 잠실점\n누적2,345,000원',
    { amount: 64000, occurredOn: '2026-11-15', merchant: '아웃백 잠실점', paymentMethod: 'card' },
  ],
  [
    '삼성카드 할부',
    '[Web발신]\n삼성1234승인 홍*동\n1,290,000원 03개월\n11/10 13:22 쿠팡\n누적3,100,000원',
    { amount: 1290000, occurredOn: '2026-11-10', merchant: '쿠팡', paymentMethod: 'card' },
  ],
  [
    '체크카드 잔액은 결제 금액이 아니다',
    '[Web발신]\nNH농협체크승인 홍*동\n4,500원\n11/19 09:05 메가MGC커피\n잔액 832,100원',
    { amount: 4500, merchant: '메가MGC커피', paymentMethod: 'card' },
  ],
  [
    '네이버페이 알림',
    '[네이버페이] 결제 완료\n쿠팡 38,900원\n11/16 21:15',
    { amount: 38900, occurredOn: '2026-11-16', merchant: '쿠팡', paymentMethod: 'naverpay' },
  ],
  [
    '라벨이 붙은 형식 (가맹점: / 결제금액:)',
    'N Pay 결제 알림\n가맹점: CGV 용산\n결제금액: 28,000원\n결제일시: 11/14 18:20',
    { amount: 28000, occurredOn: '2026-11-14', merchant: 'CGV 용산', paymentMethod: 'naverpay' },
  ],
  [
    '승인 취소 문자',
    '[Web발신]\n신한카드(1234)승인취소\n홍*동\n12,500원\n11/17 15:10 스타벅스 강남점',
    { amount: 12500, isCancel: true },
  ],
  [
    '미래 날짜가 되면 작년으로 본다 (11월에 12월 문자)',
    '[Web발신]\n하나카드 승인\n홍*동\n50,000원 일시불\n12/24 20:00\n케이크 가게',
    { occurredOn: '2025-12-24', merchant: '케이크 가게' },
  ],
  [
    '카드 문자가 아니면 아무것도 못 읽는다',
    '안녕하세요 오늘 날씨 좋네요',
    { amount: null, occurredOn: null, merchant: null, paymentMethod: null, isCancel: false },
  ],
];

describe('parseSms', () => {
  it.each(cases)('%s', (_name, text, expected) => {
    expect(parseSms(text, NOW)).toMatchObject(expected);
  });

  // 위 체크카드 예시는 결제 금액이 잔액보다 앞에 있어서, 잔액을 건너뛰는 규칙이 없어도 통과한다.
  // 잔액·누적 금액이 결제 금액보다 "먼저" 나오는 경우를 따로 확인한다.
  it.each([
    ['잔액', '[Web발신]\n우리체크 승인 홍*동\n잔액 832,100원\n4,500원\n11/19 09:05 빽다방'],
    ['누적', '[Web발신]\n현대카드 승인 홍*동\n누적 1,204,300원\n4,500원 일시불\n11/19 09:05 빽다방'],
  ])('결제 금액보다 앞에 나온 %s 금액은 건너뛴다', (_label, text) => {
    expect(parseSms(text, NOW).amount).toBe(4500);
  });

  it('윈도우 줄바꿈(\\r\\n)도 처리한다', () => {
    const r = parseSms('[Web발신]\r\n신한카드 승인\r\n7,000원\r\n11/18 12:30 김밥천국', NOW);
    expect(r).toMatchObject({ amount: 7000, merchant: '김밥천국' });
  });
});
