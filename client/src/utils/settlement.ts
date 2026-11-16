// N명 정산 계산 — 서버 server/src/utils/settlement.ts와 똑같은 코드를 복사해 둔 것이다.
// 더치페이에서 "고른 거래들만" 정산하면 얼마인지 서버에 묻지 않고 바로 미리 보여주려고 프론트에도 둔다.
// 한쪽을 고치면 다른 쪽도 같이 고쳐야 한다 (안 그러면 미리보기와 실제 정산 금액이 달라진다).

export interface SplitLike {
  userId: number;
  amount: number;
  payerSharePercent: number;
}

export interface Transfer {
  fromUserId: number;
  toUserId: number;
  amount: number;
}

// amount를 count명에게 원 단위로 최대한 똑같이 나눈다. 나머지 몇 원은 앞사람부터 1원씩 더 얹어서
// 합계가 항상 amount와 정확히 같게 한다 (각자 반올림하면 건수가 쌓일수록 몇 원씩 어긋난다).
function splitEvenly(amount: number, count: number): number[] {
  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

// 공동 지출 한 건을 누가 얼마씩 부담하는지 나눈다.
// - 2명: 낸 사람이 payerSharePercent%, 나머지는 상대방 (기존 1:1, 6:4 동작 그대로)
// - 3명 이상 + 기본값 50%: "1:1"을 그대로 적용하면 50/25/25처럼 이상해지니 전원 균등 분할로 본다
// - 3명 이상 + 그 외 비율: 낸 사람이 payerSharePercent%, 나머지를 다른 사람들이 균등 분할
function sharesFor(tx: SplitLike, memberIds: number[]): Map<number, number> {
  const shares = new Map<number, number>();
  const others = memberIds.filter((id) => id !== tx.userId);

  if (memberIds.length >= 3 && tx.payerSharePercent === 50) {
    splitEvenly(tx.amount, memberIds.length).forEach((share, i) => shares.set(memberIds[i], share));
    return shares;
  }

  const payerShare = Math.round((tx.amount * tx.payerSharePercent) / 100);
  shares.set(tx.userId, payerShare);
  splitEvenly(tx.amount - payerShare, others.length).forEach((share, i) => shares.set(others[i], share));
  return shares;
}

// 구성원별 "받을 돈(+) / 보낼 돈(-)". 실제로 낸 공동 지출 - 자기가 부담해야 할 몫.
// 모든 구성원의 합은 항상 정확히 0이다.
// 이미 가계부를 나간 사람이 낸 건(payer가 memberIds에 없음)은 정산할 상대가 없으니 건너뛴다.
export function computeBalances(transactions: SplitLike[], memberIds: number[]): Map<number, number> {
  const balances = new Map<number, number>(memberIds.map((id) => [id, 0]));
  if (memberIds.length < 2) return balances;

  for (const tx of transactions) {
    if (!balances.has(tx.userId)) continue;
    balances.set(tx.userId, balances.get(tx.userId)! + tx.amount);
    for (const [id, share] of sharesFor(tx, memberIds)) {
      balances.set(id, balances.get(id)! - share);
    }
  }
  return balances;
}

// 잔액을 "누가 누구에게 얼마"로 바꾼다. 가장 많이 받아야 하는 사람과 가장 많이 보내야 하는 사람을
// 계속 짝지어 주는 방식이라 송금은 최대 (인원 - 1)번이면 끝난다. (진짜 최소 횟수를 구하는 건 계산이
// 폭발적으로 어려워지는 문제라, 가계부 규모에서는 이 방법이 사실상 최소이면서 결과도 직관적이다.)
export function computeTransfers(balances: Map<number, number>): Transfer[] {
  const creditors = [...balances].filter(([, b]) => b > 0).map(([id, b]) => ({ id, left: b }));
  const debtors = [...balances].filter(([, b]) => b < 0).map(([id, b]) => ({ id, left: -b }));
  creditors.sort((x, y) => y.left - x.left);
  debtors.sort((x, y) => y.left - x.left);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].left, debtors[di].left);
    transfers.push({ fromUserId: debtors[di].id, toUserId: creditors[ci].id, amount });
    creditors[ci].left -= amount;
    debtors[di].left -= amount;
    if (creditors[ci].left === 0) ci++;
    if (debtors[di].left === 0) di++;
  }
  return transfers;
}
