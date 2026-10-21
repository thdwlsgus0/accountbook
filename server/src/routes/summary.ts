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

interface MemberPaidRow extends RowDataPacket {
  userId: number;
  userName: string;
  paid: number;
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

// 이번 달 "누가 얼마 더 냈는지" 정산. 공용가계부라 모든 지출을 공동 지출로 보고,
// 가계부 구성원(최대 2인)이 똑같이 나눠 부담한다고 가정했을 때 차액의 절반만 보내면
// 정산이 끝나도록 계산한다.
router.get('/settlement', async (req: Request, res: Response) => {
  await syncRecurringTransactions(req.householdId);
  const month = (req.query.month as string) || currentYearMonth();
  const [start, end] = monthRange(month);

  // household_members에서 시작해서 LEFT JOIN해야, 이번 달에 한 번도 지출을 안 적은
  // 구성원도(paid = 0으로) 목록에 빠지지 않고 나온다.
  const [members] = await pool.query<MemberPaidRow[]>(
    `SELECT u.id AS userId, u.name AS userName, COALESCE(SUM(t.amount), 0) AS paid
     FROM household_members hm
     JOIN users u ON u.id = hm.user_id
     LEFT JOIN transactions t ON t.user_id = hm.user_id AND t.household_id = hm.household_id
       AND t.type = 'expense' AND t.occurred_on >= ? AND t.occurred_on < ?
     WHERE hm.household_id = ?
     GROUP BY u.id, u.name
     ORDER BY u.id`,
    [start, end, req.householdId]
  );

  const totalExpense = members.reduce((sum, m) => sum + m.paid, 0);
  const fairShare = members.length > 0 ? totalExpense / members.length : 0;

  // 정산은 딱 2명일 때만 의미가 있다 (혼자면 나눌 상대가 없고, 가계부는 최대 2인이다).
  let settlement: { fromUserId: number; fromUserName: string; toUserId: number; toUserName: string; amount: number } | null =
    null;
  if (members.length === 2) {
    const [a, b] = members;
    const diff = a.paid - b.paid; // 양수면 a가 더 많이 냄
    const amount = Math.round(Math.abs(diff) / 2);
    if (amount > 0) {
      settlement =
        diff > 0
          ? { fromUserId: b.userId, fromUserName: b.userName, toUserId: a.userId, toUserName: a.userName, amount }
          : { fromUserId: a.userId, fromUserName: a.userName, toUserId: b.userId, toUserName: b.userName, amount };
    }
  }

  res.json({ month, members, totalExpense, fairShare, settlement });
});

export default router;
