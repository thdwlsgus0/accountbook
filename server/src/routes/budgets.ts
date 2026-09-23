import { Request, Response, Router } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireHouseholdMember);

interface BudgetRow extends RowDataPacket {
  categoryId: number;
  categoryName: string;
  amountLimit: number;
}

interface BudgetBody {
  categoryId?: number;
  month?: string;
  amountLimit?: number;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/', async (req: Request, res: Response) => {
  const month = (req.query.month as string) || currentYearMonth();
  const [rows] = await pool.query<BudgetRow[]>(
    `SELECT b.category_id AS categoryId, c.name AS categoryName, b.amount_limit AS amountLimit
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.household_id = ? AND b.month = ?`,
    [req.householdId, month]
  );
  res.json({ month, budgets: rows });
});

router.put('/', async (req: Request<{}, {}, BudgetBody>, res: Response) => {
  const { categoryId, month, amountLimit } = req.body;
  if (!categoryId || !month || amountLimit == null || amountLimit < 0) {
    return res.status(400).json({ error: { message: '카테고리, 월, 예산 금액을 확인해주세요.' } });
  }

  await pool.query(
    `INSERT INTO budgets (household_id, category_id, month, amount_limit)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE amount_limit = VALUES(amount_limit)`,
    [req.householdId, categoryId, month, amountLimit]
  );
  res.status(204).end();
});

export default router;
