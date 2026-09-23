import { Request, Response, Router } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';
import { syncRecurringTransactions } from '../utils/recurring.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireHouseholdMember);

interface TotalsRow extends RowDataPacket {
  income: number;
  expense: number;
}

interface CategorySummaryRow extends RowDataPacket {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  spent: number;
  budgetLimit: number | null;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/', async (req: Request, res: Response) => {
  await syncRecurringTransactions(req.householdId);
  const month = (req.query.month as string) || currentYearMonth();

  const [[totals]] = await pool.query<TotalsRow[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions
     WHERE household_id = ? AND DATE_FORMAT(occurred_on, '%Y-%m') = ?`,
    [req.householdId, month]
  );

  // 예산이 걸려있거나(budgetLimit) 이번 달 지출이 있는(spent > 0) 카테고리만 반환한다.
  const [byCategory] = await pool.query<CategorySummaryRow[]>(
    `SELECT c.id AS categoryId, c.name AS categoryName, c.color AS categoryColor,
            COALESCE(SUM(t.amount), 0) AS spent,
            b.amount_limit AS budgetLimit
     FROM categories c
     LEFT JOIN transactions t ON t.category_id = c.id
       AND DATE_FORMAT(t.occurred_on, '%Y-%m') = ? AND t.type = 'expense'
     LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ? AND b.household_id = c.household_id
     WHERE c.household_id = ? AND c.type = 'expense'
     GROUP BY c.id, c.name, c.color, b.amount_limit
     HAVING spent > 0 OR budgetLimit IS NOT NULL
     ORDER BY spent DESC`,
    [month, month, req.householdId]
  );

  res.json({
    month,
    income: totals.income,
    expense: totals.expense,
    balance: totals.income - totals.expense,
    categories: byCategory.map((c) => ({
      ...c,
      isOverBudget: c.budgetLimit != null && c.spent > c.budgetLimit,
    })),
  });
});

export default router;
