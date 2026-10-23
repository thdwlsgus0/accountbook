import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';

interface RecurringRuleRow extends RowDataPacket {
  id: number;
  user_id: number;
  category_id: number | null;
  type: 'income' | 'expense';
  amount: number;
  memo: string | null;
  day_of_month: number;
  split_type: 'shared' | 'personal';
  payer_share_percent: number;
}

function currentYearMonth(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// 고정비를 매번 DB에 미리 심어두는 대신, 거래 내역/요약을 조회할 때마다
// "아직 이번 달 치가 기록되지 않은 규칙"을 찾아 그 자리에서 생성한다.
// 서버가 꺼져 있던 기간이 있어도(예: 며칠간 서버 미실행) 다음 조회 시점에 놓친 달만큼
// 소급 생성되지는 않고, "이번 달" 기준으로만 동작한다 — 별도 배치/크론 없이도
// 사용자 입장에서는 "들어올 때마다 자동으로 채워져 있는" 것처럼 보이게 하는 실용적인 절충이다.
export async function syncRecurringTransactions(householdId: number): Promise<void> {
  const today = new Date();
  const thisMonth = currentYearMonth(today);
  const todayDate = today.getDate();

  const [rules] = await pool.query<RecurringRuleRow[]>(
    `SELECT * FROM recurring_transactions
     WHERE household_id = ? AND is_active = TRUE
       AND start_month <= ?
       AND (last_generated_month IS NULL OR last_generated_month < ?)
       AND day_of_month <= ?`,
    [householdId, thisMonth, thisMonth, todayDate]
  );

  for (const rule of rules) {
    // 대시보드 같은 화면은 /summary, /transactions 등 여러 API를 동시에 부르고,
    // 그 각각이 이 함수를 독립적으로 호출한다. 예전엔 "조회 -> INSERT -> UPDATE" 순서라
    // 두 요청이 거의 동시에 들어오면 둘 다 "아직 안 만들어졌다"고 보고 같은 달 거래를
    // 두 번 만들 수 있었다 (경쟁 상태). 그래서 INSERT보다 먼저, 이 UPDATE로
    // "이번 달 치는 내가 만든다"는 걸 원자적으로 선점한다 — last_generated_month가
    // 그 사이 다른 요청에 의해 이미 갱신됐다면 WHERE 조건이 더 이상 맞지 않아
    // affectedRows가 0이 되고, 그 요청은 생성을 건너뛴다.
    const [claim] = await pool.query<ResultSetHeader>(
      `UPDATE recurring_transactions
       SET last_generated_month = ?
       WHERE id = ? AND (last_generated_month IS NULL OR last_generated_month < ?)`,
      [thisMonth, rule.id, thisMonth]
    );
    if (claim.affectedRows === 0) continue; // 다른 요청이 먼저 선점함

    const occurredOn = `${thisMonth}-${String(rule.day_of_month).padStart(2, '0')}`;
    await pool.query(
      `INSERT INTO transactions
         (household_id, user_id, category_id, type, amount, memo, occurred_on, split_type, payer_share_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        householdId,
        rule.user_id,
        rule.category_id,
        rule.type,
        rule.amount,
        rule.memo ?? '(고정비 자동 등록)',
        occurredOn,
        rule.split_type,
        rule.payer_share_percent,
      ]
    );
  }
}
