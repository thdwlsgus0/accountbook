import { Request, Response, Router } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';
import { syncRecurringTransactions } from '../utils/recurring.js';
import { currentYearMonth, monthRange, previousYearMonth } from '../utils/date.js';

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

interface CategoryCompareRow extends RowDataPacket {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  current: number;
  previous: number;
}

interface DailyRow extends RowDataPacket {
  date: string;
  income: number;
  expense: number;
}

interface TotalsCompareRow extends RowDataPacket {
  currentIncome: number;
  currentExpense: number;
  previousIncome: number;
  previousExpense: number;
}

router.get('/', async (req: Request, res: Response) => {
  await syncRecurringTransactions(req.householdId);
  const month = (req.query.month as string) || currentYearMonth();
  const [start, end] = monthRange(month);

  const [[totals]] = await pool.query<TotalsRow[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions
     WHERE household_id = ? AND occurred_on >= ? AND occurred_on < ?`,
    [req.householdId, start, end]
  );

  // 예산이 걸려있거나(budgetLimit) 이번 달 지출이 있는(spent > 0) 카테고리만 반환한다.
  const [byCategory] = await pool.query<CategorySummaryRow[]>(
    `SELECT c.id AS categoryId, c.name AS categoryName, c.color AS categoryColor,
            COALESCE(SUM(t.amount), 0) AS spent,
            b.amount_limit AS budgetLimit
     FROM categories c
     LEFT JOIN transactions t ON t.category_id = c.id
       AND t.occurred_on >= ? AND t.occurred_on < ? AND t.type = 'expense'
     LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ? AND b.household_id = c.household_id
     WHERE c.household_id = ? AND c.type = 'expense'
     GROUP BY c.id, c.name, c.color, b.amount_limit
     HAVING spent > 0 OR budgetLimit IS NOT NULL
     ORDER BY spent DESC`,
    [start, end, month, req.householdId]
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

// 통계 탭에서 쓰는 데이터: 지난달 대비 카테고리별 증감 + 날짜별 지출(캘린더용).
// "이번 달 가장 많이 쓴 카테고리 Top 3"는 categories가 이미 spent 내림차순이라 프론트에서 앞 3개만 쓰면 된다.
router.get('/insights', async (req: Request, res: Response) => {
  await syncRecurringTransactions(req.householdId);
  const month = (req.query.month as string) || currentYearMonth();
  const previousMonth = previousYearMonth(month);
  const [currentStart, currentEnd] = monthRange(month);
  const [previousStart] = monthRange(previousMonth);
  // previousStart ~ currentEnd는 지난달 1일부터 이번 달 말일 다음날까지, 즉 두 달치를 이어붙인 구간이다.
  // 이 구간으로 한 번만 훑고, 그 안에서 currentStart를 기준으로 "이번 달/지난달"을 나눈다.

  const [categories] = await pool.query<CategoryCompareRow[]>(
    `SELECT c.id AS categoryId, c.name AS categoryName, c.color AS categoryColor,
            COALESCE(SUM(CASE WHEN t.occurred_on >= ? THEN t.amount ELSE 0 END), 0) AS current,
            COALESCE(SUM(CASE WHEN t.occurred_on < ? THEN t.amount ELSE 0 END), 0) AS previous
     FROM categories c
     LEFT JOIN transactions t ON t.category_id = c.id AND t.type = 'expense'
       AND t.occurred_on >= ? AND t.occurred_on < ?
     WHERE c.household_id = ? AND c.type = 'expense'
     GROUP BY c.id, c.name, c.color
     HAVING current > 0 OR previous > 0
     ORDER BY current DESC`,
    [currentStart, currentStart, previousStart, currentEnd, req.householdId]
  );

  const [daily] = await pool.query<DailyRow[]>(
    `SELECT DATE_FORMAT(occurred_on, '%Y-%m-%d') AS date,
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions
     WHERE household_id = ? AND occurred_on >= ? AND occurred_on < ?
     GROUP BY date
     ORDER BY date`,
    [req.householdId, currentStart, currentEnd]
  );

  // 이번 달 수입/지출을 지난달과 통째로 비교한다 (카테고리별이 아니라 전체 합계).
  const [[totals]] = await pool.query<TotalsCompareRow[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN occurred_on >= ? AND type = 'income' THEN amount ELSE 0 END), 0) AS currentIncome,
       COALESCE(SUM(CASE WHEN occurred_on >= ? AND type = 'expense' THEN amount ELSE 0 END), 0) AS currentExpense,
       COALESCE(SUM(CASE WHEN occurred_on < ? AND type = 'income' THEN amount ELSE 0 END), 0) AS previousIncome,
       COALESCE(SUM(CASE WHEN occurred_on < ? AND type = 'expense' THEN amount ELSE 0 END), 0) AS previousExpense
     FROM transactions
     WHERE household_id = ? AND occurred_on >= ? AND occurred_on < ?`,
    [currentStart, currentStart, currentStart, currentStart, req.householdId, previousStart, currentEnd]
  );

  res.json({ month, previousMonth, categories, daily, totals });
});

export default router;
