import { Request, Response, Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';
import { parseSplit, SplitType } from '../utils/split.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireHouseholdMember);

interface TemplateRow extends RowDataPacket {
  id: number;
  name: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  splitType: SplitType;
  payerSharePercent: number;
}

interface TemplateBody {
  name?: string;
  amount?: number;
  categoryId?: number | null;
  splitType?: string;
  payerSharePercent?: number;
}

router.get('/', async (req: Request, res: Response) => {
  const [rows] = await pool.query<TemplateRow[]>(
    `SELECT t.id, t.name, t.amount, t.category_id AS categoryId,
            c.name AS categoryName, c.color AS categoryColor,
            t.split_type AS splitType, t.payer_share_percent AS payerSharePercent
     FROM expense_templates t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.household_id = ?
     ORDER BY t.id`,
    [req.householdId]
  );
  res.json({ templates: rows });
});

router.post('/', async (req: Request<{}, {}, TemplateBody>, res: Response) => {
  const name = req.body.name?.trim();
  const { amount, categoryId } = req.body;
  if (!name || name.length > 100 || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: { message: '템플릿 이름(메모)과 금액을 확인해주세요.' } });
  }
  const split = parseSplit(req.body);
  if (!split.ok) {
    return res.status(400).json({ error: { message: split.message } });
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO expense_templates
       (household_id, user_id, name, amount, category_id, split_type, payer_share_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      req.householdId,
      req.userId,
      name,
      amount,
      categoryId || null,
      split.value.splitType,
      split.value.payerSharePercent,
    ]
  );
  res.status(201).json({ id: result.insertId });
});

// "원탭 입력" — 템플릿 내용 그대로 지출을 하나 기록한다. 누른 사람이 낸 사람이 된다.
// 날짜는 서버 시간대와 사용자 시간대가 다를 수 있어서(Vercel은 UTC) 클라이언트가 자기 기준 오늘을 보낸다.
router.post('/:id/use', async (req: Request<{ id: string }, {}, { occurredOn?: string }>, res: Response) => {
  const { occurredOn } = req.body;
  if (!occurredOn || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return res.status(400).json({ error: { message: '날짜를 확인해주세요.' } });
  }

  const [rows] = await pool.query<TemplateRow[]>(
    `SELECT name, amount, category_id AS categoryId,
            split_type AS splitType, payer_share_percent AS payerSharePercent
     FROM expense_templates
     WHERE id = ? AND household_id = ?`,
    [req.params.id, req.householdId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: { message: '템플릿을 찾을 수 없습니다.' } });
  }
  const t = rows[0];

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO transactions
       (household_id, user_id, category_id, type, amount, memo, occurred_on, split_type, payer_share_percent)
     VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?)`,
    [req.householdId, req.userId, t.categoryId, t.amount, t.name, occurredOn, t.splitType, t.payerSharePercent]
  );
  res.status(201).json({ id: result.insertId });
});

router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  await pool.query('DELETE FROM expense_templates WHERE id = ? AND household_id = ?', [
    req.params.id,
    req.householdId,
  ]);
  res.status(204).end();
});

export default router;
