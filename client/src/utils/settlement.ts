export interface SplitLike {
  userId: number;
  amount: number;
  payerSharePercent: number;
}

export interface SettlementResult {
  fromUserId: number;
  toUserId: number;
  amount: number;
}

// "더치페이" 등에서, 고른 공동 지출 건들만 갖고 누가 누구에게 얼마를 보내면 되는지 계산한다.
// 서버 summary.ts의 /settlement 계산과 같은 방식(건별 payerSharePercent 반영)이고,
// 전체 달이 아니라 "선택한 일부 거래"처럼 임의의 부분집합에도 그대로 쓸 수 있다.
// memberIds가 정확히 2명일 때만 의미가 있다(가계부는 최대 2인).
export function computeSettlement(transactions: SplitLike[], memberIds: [number, number]): SettlementResult | null {
  const [idA, idB] = memberIds;
  const responsibility: Record<number, number> = { [idA]: 0, [idB]: 0 };
  const paid: Record<number, number> = { [idA]: 0, [idB]: 0 };

  for (const tx of transactions) {
    const otherId = tx.userId === idA ? idB : idA;
    // payerShare + otherShare가 항상 amount와 정확히 같도록 otherShare는 빼기로 구한다
    // (각각 따로 반올림하면 건수가 많아질수록 몇 원씩 어긋날 수 있다).
    const payerShare = Math.round((tx.amount * tx.payerSharePercent) / 100);
    const otherShare = tx.amount - payerShare;
    responsibility[tx.userId] += payerShare;
    responsibility[otherId] += otherShare;
    paid[tx.userId] += tx.amount;
  }

  const balanceA = paid[idA] - responsibility[idA];
  const amount = Math.abs(balanceA);
  if (amount === 0) return null;
  return balanceA > 0 ? { fromUserId: idB, toUserId: idA, amount } : { fromUserId: idA, toUserId: idB, amount };
}
