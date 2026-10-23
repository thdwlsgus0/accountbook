import { SplitType } from '../types';

// 거래 목록에 붙이는 작은 배지 문구. 1:1(기본값)은 굳이 안 보여줘서 목록을 깔끔하게 둔다.
// - 개인 지출: "개인"
// - 비율이 다른 공동 지출: "6:4" 같은 식
// - 1:1 공동 지출: null (배지 없음)
export function splitBadgeLabel(splitType: SplitType, payerSharePercent: number): string | null {
  if (splitType === 'personal') return '개인';
  if (payerSharePercent === 50) return null;
  return `${payerSharePercent / 10}:${(100 - payerSharePercent) / 10}`;
}

export function formatCurrency(amount: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(amount)}원`;
}

// 캘린더 칸처럼 좁은 공간에 쓰는 축약 표시. 1만원 이상이면 "3.5만" 식으로 줄인다.
export function formatCompactCurrency(amount: number): string {
  if (amount >= 10000) {
    const value = Math.round(amount / 1000) / 10;
    return `${value}만`;
  }
  return new Intl.NumberFormat('ko-KR').format(amount);
}
