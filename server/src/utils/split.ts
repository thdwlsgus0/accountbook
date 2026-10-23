export type SplitType = 'shared' | 'personal';

export interface SplitInput {
  splitType?: string;
  payerSharePercent?: number;
}

export interface ParsedSplit {
  splitType: SplitType;
  payerSharePercent: number;
}

export type ParseSplitResult = { ok: true; value: ParsedSplit } | { ok: false; message: string };

// 지출을 "공동 지출(shared, 둘이 나눠 부담)" / "내 개인 지출(personal, 정산 대상 제외)"로
// 구분하고, 공동 지출이면 "낸 사람(payer)이 부담하는 비율(%)"을 검증한다.
// 50이면 1:1, 60이면 6:4(낸 사람이 더 많이 부담)로 나중에 정산 계산에 쓰인다.
export function parseSplit(body: SplitInput): ParseSplitResult {
  const splitType = body.splitType ?? 'shared';
  if (splitType !== 'shared' && splitType !== 'personal') {
    return { ok: false, message: "지출 구분(splitType)은 'shared' 또는 'personal'이어야 합니다." };
  }

  if (splitType === 'personal') {
    // 개인 지출은 전부 낸 사람 혼자 부담하는 것과 수학적으로 같아서, 비율을 100으로 고정해둔다
    // (정산 계산 쪽에서는 어차피 split_type으로 걸러내고 이 값을 보지 않는다).
    return { ok: true, value: { splitType, payerSharePercent: 100 } };
  }

  const percent = body.payerSharePercent ?? 50;
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
    return { ok: false, message: '분담 비율은 1~99 사이의 정수여야 합니다.' };
  }
  return { ok: true, value: { splitType, payerSharePercent: percent } };
}
