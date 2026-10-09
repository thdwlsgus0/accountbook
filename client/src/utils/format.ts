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
