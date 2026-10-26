import { Request, Response, Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';
import { syncRecurringTransactions } from '../utils/recurring.js';
import { currentYearMonth, monthRange } from '../utils/date.js';
import { parseSplit, SplitType } from '../utils/split.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireHouseholdMember);

interface TransactionRow extends RowDataPacket {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  memo: string | null;
  occurredOn: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  userId: number;
  userName: string;
  splitType: SplitType;
  payerSharePercent: number;
  isSettled: boolean;
}

interface TransactionBody {
  type?: 'income' | 'expense';
  amount?: number;
  categoryId?: number | null;
  memo?: string | null;
  occurredOn?: string;
  splitType?: string;
  payerSharePercent?: number;
}

function isValidTransactionBody(body: TransactionBody): body is Required<Pick<TransactionBody, 'type' | 'amount' | 'occurredOn'>> & TransactionBody {
  return (
    !!body.type &&
    ['income', 'expense'].includes(body.type) &&
    typeof body.amount === 'number' &&
    body.amount > 0 &&
    !!body.occurredOn
  );
}

router.get('/', async (req: Request, res: Response) => {
  await syncRecurringTransactions(req.householdId);

  const month = (req.query.month as string) || currentYearMonth();
  const [start, end] = monthRange(month);
  const [rows] = await pool.query<TransactionRow[]>(
    `SELECT t.id, t.type, t.amount, t.memo, t.occurred_on AS occurredOn,
            t.category_id AS categoryId, c.name AS categoryName, c.color AS categoryColor,
            t.user_id AS userId, u.name AS userName,
            t.split_type AS splitType, t.payer_share_percent AS payerSharePercent,
            t.is_settled AS isSettled
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     JOIN users u ON u.id = t.user_id
     WHERE t.household_id = ? AND t.occurred_on >= ? AND t.occurred_on < ?
     ORDER BY t.occurred_on DESC, t.id DESC`,
    [req.householdId, start, end]
  );
  res.json({ transactions: rows });
});

// 엑셀에서 바로 열어볼 수 있는 CSV로 내보낸다. month를 주면 그 달만, 안 주면 전체 내역(백업용).
// 쉼표/줄바꿈/겹따옴표가 메모에 들어있어도 깨지지 않도록 직접 CSV 이스케이프를 한다.
function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

router.get('/export', async (req: Request, res: Response) => {
  await syncRecurringTransactions(req.householdId);
  const month = req.query.month as string | undefined;
  const range = month ? monthRange(month) : null;

  const [rows] = await pool.query<TransactionRow[]>(
    `SELECT t.id, t.type, t.amount, t.memo, t.occurred_on AS occurredOn,
            t.category_id AS categoryId, c.name AS categoryName, c.color AS categoryColor,
            t.user_id AS userId, u.name AS userName,
            t.split_type AS splitType, t.payer_share_percent AS payerSharePercent,
            t.is_settled AS isSettled
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     JOIN users u ON u.id = t.user_id
     WHERE t.household_id = ?
       ${range ? 'AND t.occurred_on >= ? AND t.occurred_on < ?' : ''}
     ORDER BY t.occurred_on ASC, t.id ASC`,
    range ? [req.householdId, range[0], range[1]] : [req.householdId]
  );

  const header = ['날짜', '유형', '카테고리', '금액', '메모', '작성자', '구분', '낸 사람 부담 비율', '정산 여부'].map(
    csvCell
  ).join(',');
  const lines = rows.map((r) =>
    [
      r.occurredOn,
      r.type === 'income' ? '수입' : '지출',
      r.categoryName || '미분류',
      r.amount,
      r.memo || '',
      r.userName,
      r.splitType === 'personal' ? '개인' : '공동',
      r.splitType === 'personal' ? '-' : `${r.payerSharePercent}%`,
      r.splitType === 'personal' ? '-' : r.isSettled ? '완료' : '대기',
    ]
      .map(csvCell)
      .join(',')
  );
  // 윈도우 엑셀과의 호환을 위해 CRLF를 쓰고, 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙인다.
  const csv = '﻿' + [header, ...lines].join('\r\n');

  const filename = month ? `transactions_${month}.csv` : 'transactions_all.csv';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// "더치페이" — 고른 공동 지출 건들을 그 자리에서 정산 완료로 표시한다.
// 정산 완료된 건은 월간 정산(/summary/settlement) 계산에서 빠진다(이미 처리된 거니까).
// 개인 지출(personal)은 정산 개념이 없으니 WHERE에서 자연스럽게 걸러지고 조용히 무시된다.
router.post('/settle', async (req: Request<{}, {}, { ids?: number[] }>, res: Response) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id))) {
    return res.status(400).json({ error: { message: '정산 처리할 내역을 선택해주세요.' } });
  }

  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE transactions SET is_settled = TRUE
     WHERE household_id = ? AND split_type = 'shared' AND id IN (${placeholders})`,
    [req.householdId, ...ids]
  );
  res.json({ updated: result.affectedRows });
});

router.post('/', async (req: Request<{}, {}, TransactionBody>, res: Response) => {
  if (!isValidTransactionBody(req.body)) {
    return res.status(400).json({ error: { message: '종류, 금액(0보다 큼), 날짜를 확인해주세요.' } });
  }
  const split = parseSplit(req.body);
  if (!split.ok) {
    return res.status(400).json({ error: { message: split.message } });
  }
  const { type, amount, categoryId, memo, occurredOn } = req.body;
  const { splitType, payerSharePercent } = split.value;

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO transactions
       (household_id, user_id, category_id, type, amount, memo, occurred_on, split_type, payer_share_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.householdId, req.userId, categoryId || null, type, amount, memo || null, occurredOn, splitType, payerSharePercent]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/:id', async (req: Request<{ id: string }, {}, TransactionBody>, res: Response) => {
  if (!isValidTransactionBody(req.body)) {
    return res.status(400).json({ error: { message: '종류, 금액(0보다 큼), 날짜를 확인해주세요.' } });
  }
  const split = parseSplit(req.body);
  if (!split.ok) {
    return res.status(400).json({ error: { message: split.message } });
  }
  const { type, amount, categoryId, memo, occurredOn } = req.body;
  const { splitType, payerSharePercent } = split.value;

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE transactions
     SET type = ?, amount = ?, category_id = ?, memo = ?, occurred_on = ?, split_type = ?, payer_share_percent = ?
     WHERE id = ? AND household_id = ?`,
    [type, amount, categoryId || null, memo || null, occurredOn, splitType, payerSharePercent, req.params.id, req.householdId]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: { message: '거래 내역을 찾을 수 없습니다.' } });
  }
  res.status(204).end();
});

router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  await pool.query('DELETE FROM transactions WHERE id = ? AND household_id = ?', [
    req.params.id,
    req.householdId,
  ]);
  res.status(204).end();
});

export default router;
