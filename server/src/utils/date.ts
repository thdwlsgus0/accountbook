// 여러 라우트에서 "이번 달(YYYY-MM)" 관련 계산을 각자 복붙해서 쓰고 있던 걸 모아둔 곳.

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// "2026-10" -> "2026-09" 처럼 한 달 전 YYYY-MM을 구한다.
export function previousYearMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// "YYYY-MM" -> [이번 달 1일, 다음 달 1일) 형태의 반열린 날짜 구간으로 바꾼다.
//
// occurred_on(DATE 컬럼)을 "DATE_FORMAT(occurred_on, '%Y-%m') = ?"로 비교하면 컬럼을 함수에 씌우게 되어
// idx_household_occurred(household_id, occurred_on) 인덱스를 못 타고, 그 household의 거래 내역을
// 매번 전부 훑어서 포맷한 뒤 비교한다 (지금이야 데이터가 적어 체감이 안 되지만 쌓일수록 느려진다).
// ">=, <" 범위 비교로 바꾸면 같은 인덱스를 그대로 타서 필요한 구간만 읽는다.
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const nextMonth = new Date(y, m, 1); // JS Date는 month가 0-based라, m(1-based 다음 달)을 그대로 넣으면 다음 달 1일이 된다.
  const end = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
  return [start, end];
}
