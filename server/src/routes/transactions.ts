import express, { Request, Response, Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';
import { syncRecurringTransactions } from '../utils/recurring.js';
import { currentYearMonth, monthRange } from '../utils/date.js';
import { parseSplit, SplitType } from '../utils/split.js';
import { parsePaymentMethod, PAYMENT_METHOD_LABEL, PaymentMethod, PAYMENT_METHODS } from '../utils/payment.js';
import { extractTags } from '../utils/tags.js';

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
  hasReceipt: boolean;
  paymentMethod: PaymentMethod | null;
}

interface ReceiptRow extends RowDataPacket {
  mimeType: string;
  data: Buffer;
}

// 영수증 사진으로 받을 수 있는 형식과 최대 크기. 클라이언트가 JPEG로 압축해서 보내지만,
// 직접 API를 부르는 경우도 막기 위해 서버에서도 한 번 더 제한한다.
// (Vercel 서버리스 함수의 요청 본문 한도가 4.5MB라 그보다 작게 둔다)
const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const RECEIPT_MAX_BYTES = 3 * 1024 * 1024;

interface TransactionBody {
  type?: 'income' | 'expense';
  amount?: number;
  categoryId?: number | null;
  memo?: string | null;
  occurredOn?: string;
  splitType?: string;
  payerSharePercent?: number;
  paymentMethod?: string | null;
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

// 월별 목록과 검색 결과가 같은 모양으로 내려가도록 SELECT/JOIN을 같이 쓴다.
const LIST_COLUMNS = `t.id, t.type, t.amount, t.memo, t.occurred_on AS occurredOn,
            t.category_id AS categoryId, c.name AS categoryName, c.color AS categoryColor,
            t.user_id AS userId, u.name AS userName,
            t.split_type AS splitType, t.payer_share_percent AS payerSharePercent,
            t.is_settled AS isSettled, t.payment_method AS paymentMethod,
            EXISTS(SELECT 1 FROM transaction_receipts r WHERE r.transaction_id = t.id) AS hasReceipt`;
const LIST_FROM = `FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     JOIN users u ON u.id = t.user_id`;

router.get('/', async (req: Request, res: Response) => {
  await syncRecurringTransactions(req.householdId);

  const month = (req.query.month as string) || currentYearMonth();
  const [start, end] = monthRange(month);
  const [rows] = await pool.query<TransactionRow[]>(
    `SELECT ${LIST_COLUMNS}
     ${LIST_FROM}
     WHERE t.household_id = ? AND t.occurred_on >= ? AND t.occurred_on < ?
     ORDER BY t.occurred_on DESC, t.id DESC`,
    [req.householdId, start, end]
  );
  // MySQL은 EXISTS 결과를 0/1 숫자로 돌려주므로 프론트 타입에 맞게 boolean으로 바꿔준다.
  res.json({ transactions: rows.map((r) => ({ ...r, hasReceipt: !!r.hasReceipt })) });
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
            t.is_settled AS isSettled, t.payment_method AS paymentMethod
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     JOIN users u ON u.id = t.user_id
     WHERE t.household_id = ?
       ${range ? 'AND t.occurred_on >= ? AND t.occurred_on < ?' : ''}
     ORDER BY t.occurred_on ASC, t.id ASC`,
    range ? [req.householdId, range[0], range[1]] : [req.householdId]
  );

  const header = ['날짜', '유형', '카테고리', '금액', '메모', '작성자', '구분', '낸 사람 부담 비율', '정산 여부', '결제수단'].map(
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
      r.paymentMethod ? PAYMENT_METHOD_LABEL[r.paymentMethod] : '-',
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

// 검색: 모든 달에서 조건에 맞는 내역을 찾는다. 조건은 전부 선택이고, 준 것만 AND로 묶는다.
// - q: 메모나 카테고리 이름에 들어간 글자 / tag: 메모 속 #태그 (정확히 그 태그만)
// - from, to: 날짜(YYYY-MM-DD, 둘 다 포함) / min, max: 금액 / type, categoryId, paymentMethod, userId
//   (categoryId, paymentMethod는 'none'이면 "미분류/미지정"만)
// 목록은 최근 300건까지만 내려주고, 건수·합계는 조건에 맞는 전체 기준으로 계산한다.
const SEARCH_LIMIT = 300;
const SEARCH_SCAN_LIMIT = 5000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

router.get('/search', async (req: Request, res: Response) => {
  const str = (key: string) => {
    const v = req.query[key];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };
  const conditions = ['t.household_id = ?'];
  const params: unknown[] = [req.householdId];

  const q = str('q');
  if (q) {
    conditions.push("(t.memo LIKE ? ESCAPE '\\\\' OR c.name LIKE ? ESCAPE '\\\\')");
    params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`);
  }
  const tag = str('tag')?.replace(/^#/, '') ?? null;
  if (tag) {
    // LIKE로 먼저 좁히고, "#여행지"가 "#여행"에 걸리지 않게 아래에서 태그를 정확히 다시 확인한다.
    conditions.push("t.memo LIKE ? ESCAPE '\\\\'");
    params.push(`%#${escapeLike(tag)}%`);
  }
  const from = str('from');
  if (from && DATE_ONLY.test(from)) {
    conditions.push('t.occurred_on >= ?');
    params.push(from);
  }
  const to = str('to');
  if (to && DATE_ONLY.test(to)) {
    conditions.push('t.occurred_on <= ?');
    params.push(to);
  }
  const min = Number(str('min'));
  if (str('min') && Number.isFinite(min)) {
    conditions.push('t.amount >= ?');
    params.push(min);
  }
  const max = Number(str('max'));
  if (str('max') && Number.isFinite(max)) {
    conditions.push('t.amount <= ?');
    params.push(max);
  }
  const type = str('type');
  if (type === 'income' || type === 'expense') {
    conditions.push('t.type = ?');
    params.push(type);
  }
  const categoryId = str('categoryId');
  if (categoryId === 'none') conditions.push('t.category_id IS NULL');
  else if (categoryId && Number.isInteger(Number(categoryId))) {
    conditions.push('t.category_id = ?');
    params.push(Number(categoryId));
  }
  const paymentMethod = str('paymentMethod');
  if (paymentMethod === 'none') conditions.push('t.payment_method IS NULL');
  else if (paymentMethod && (PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    conditions.push('t.payment_method = ?');
    params.push(paymentMethod);
  }
  const userId = str('userId');
  if (userId && Number.isInteger(Number(userId))) {
    conditions.push('t.user_id = ?');
    params.push(Number(userId));
  }

  const [rows] = await pool.query<TransactionRow[]>(
    `SELECT ${LIST_COLUMNS}
     ${LIST_FROM}
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.occurred_on DESC, t.id DESC
     LIMIT ${SEARCH_SCAN_LIMIT}`,
    params
  );
  const matched = tag ? rows.filter((r) => extractTags(r.memo).includes(tag)) : rows;

  res.json({
    transactions: matched.slice(0, SEARCH_LIMIT).map((r) => ({ ...r, hasReceipt: !!r.hasReceipt })),
    count: matched.length,
    expense: matched.filter((r) => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0),
    income: matched.filter((r) => r.type === 'income').reduce((sum, r) => sum + r.amount, 0),
    truncated: matched.length > SEARCH_LIMIT,
  });
});

// 이 가계부에서 쓴 #태그 목록과 태그별 건수·지출 합계. 많이 쓴 순.
router.get('/tags', async (req: Request, res: Response) => {
  const [rows] = await pool.query<(RowDataPacket & { memo: string; type: string; amount: number })[]>(
    `SELECT memo, type, amount FROM transactions WHERE household_id = ? AND memo LIKE '%#%'`,
    [req.householdId]
  );
  const stats = new Map<string, { count: number; expense: number }>();
  for (const row of rows) {
    for (const tag of extractTags(row.memo)) {
      const prev = stats.get(tag) ?? { count: 0, expense: 0 };
      stats.set(tag, {
        count: prev.count + 1,
        expense: prev.expense + (row.type === 'expense' ? row.amount : 0),
      });
    }
  }
  const tags = [...stats]
    .map(([tag, s]) => ({ tag, ...s }))
    .sort((a, b) => b.count - a.count || b.expense - a.expense)
    .slice(0, 50);
  res.json({ tags });
});

// 카테고리 자동 추천용: 최근 1년 동안 "이 메모엔 이 카테고리를 몇 번 골랐는지".
// 글자를 칠 때마다 서버를 부르지 않도록 목록을 한 번에 내려주고, 추천 계산은 프론트에서 한다.
// 자주 쓴 조합 500개면 가계부 하나엔 충분하다.
interface MemoCategoryRow extends RowDataPacket {
  memo: string;
  type: 'income' | 'expense';
  categoryId: number;
  count: number;
}

router.get('/memo-categories', async (req: Request, res: Response) => {
  const [rows] = await pool.query<MemoCategoryRow[]>(
    `SELECT memo, type, category_id AS categoryId, COUNT(*) AS count
     FROM transactions
     WHERE household_id = ? AND memo IS NOT NULL AND memo <> '' AND category_id IS NOT NULL
       AND occurred_on >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
     GROUP BY memo, type, category_id
     ORDER BY count DESC
     LIMIT 500`,
    [req.householdId]
  );
  res.json({ memoCategories: rows.map((r) => ({ ...r, count: Number(r.count) })) });
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
  const payment = parsePaymentMethod(req.body.paymentMethod);
  if (!payment.ok) {
    return res.status(400).json({ error: { message: payment.message } });
  }
  const { type, amount, categoryId, memo, occurredOn } = req.body;
  const { splitType, payerSharePercent } = split.value;
  // 결제수단은 지출에만 의미가 있다.
  const paymentMethod = type === 'expense' ? payment.value : null;

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO transactions
       (household_id, user_id, category_id, type, amount, memo, occurred_on, split_type, payer_share_percent,
        payment_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.householdId,
      req.userId,
      categoryId || null,
      type,
      amount,
      memo || null,
      occurredOn,
      splitType,
      payerSharePercent,
      paymentMethod,
    ]
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
  const payment = parsePaymentMethod(req.body.paymentMethod);
  if (!payment.ok) {
    return res.status(400).json({ error: { message: payment.message } });
  }
  const { type, amount, categoryId, memo, occurredOn } = req.body;
  const { splitType, payerSharePercent } = split.value;
  const paymentMethod = type === 'expense' ? payment.value : null;

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE transactions
     SET type = ?, amount = ?, category_id = ?, memo = ?, occurred_on = ?, split_type = ?, payer_share_percent = ?,
         payment_method = ?
     WHERE id = ? AND household_id = ?`,
    [
      type,
      amount,
      categoryId || null,
      memo || null,
      occurredOn,
      splitType,
      payerSharePercent,
      paymentMethod,
      req.params.id,
      req.householdId,
    ]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: { message: '거래 내역을 찾을 수 없습니다.' } });
  }
  res.status(204).end();
});

// 영수증 사진 업로드/교체. 본문은 JSON이 아니라 이미지 바이트 그대로(Content-Type: image/jpeg 등)를 받는다.
// 거래 1건당 사진 1장이라 이미 있으면 덮어쓴다.
router.put(
  '/:id/receipt',
  express.raw({ type: RECEIPT_MIME_TYPES, limit: RECEIPT_MAX_BYTES }),
  async (req: Request<{ id: string }>, res: Response) => {
    const mimeType = req.headers['content-type'];
    if (!mimeType || !RECEIPT_MIME_TYPES.includes(mimeType) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: { message: 'JPEG, PNG, WEBP 사진만 첨부할 수 있습니다.' } });
    }

    const [owned] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM transactions WHERE id = ? AND household_id = ?',
      [req.params.id, req.householdId]
    );
    if (owned.length === 0) {
      return res.status(404).json({ error: { message: '거래 내역을 찾을 수 없습니다.' } });
    }

    await pool.query(
      `INSERT INTO transaction_receipts (transaction_id, mime_type, data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), data = VALUES(data), created_at = CURRENT_TIMESTAMP`,
      [req.params.id, mimeType, req.body]
    );
    res.status(204).end();
  }
);

// 영수증 사진 원본 바이트를 그대로 내려준다. 프론트는 Authorization 헤더로 인증하므로
// <img src>로 직접 못 걸고, axios로 Blob을 받아 object URL로 보여준다.
router.get('/:id/receipt', async (req: Request<{ id: string }>, res: Response) => {
  const [rows] = await pool.query<ReceiptRow[]>(
    `SELECT r.mime_type AS mimeType, r.data
     FROM transaction_receipts r
     JOIN transactions t ON t.id = r.transaction_id
     WHERE r.transaction_id = ? AND t.household_id = ?`,
    [req.params.id, req.householdId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: { message: '첨부된 영수증이 없습니다.' } });
  }
  res.setHeader('Content-Type', rows[0].mimeType);
  // 같은 주소로 사진이 교체될 수 있으니 브라우저가 매번 서버에 확인하게 한다.
  res.setHeader('Cache-Control', 'private, no-cache');
  res.send(rows[0].data);
});

router.delete('/:id/receipt', async (req: Request<{ id: string }>, res: Response) => {
  await pool.query(
    `DELETE r FROM transaction_receipts r
     JOIN transactions t ON t.id = r.transaction_id
     WHERE r.transaction_id = ? AND t.household_id = ?`,
    [req.params.id, req.householdId]
  );
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
