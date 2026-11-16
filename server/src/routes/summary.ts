import { Request, Response, Router } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';
import { syncRecurringTransactions } from '../utils/recurring.js';
import { currentYearMonth, monthRange, previousYearMonth } from '../utils/date.js';
import { computeBalances, computeTransfers } from '../utils/settlement.js';

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

interface DateMonthlyRow extends RowDataPacket {
  month: number;
  total: number;
  count: number;
}

interface DateCategoryRow extends RowDataPacket {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  total: number;
}

interface DateTopRow extends RowDataPacket {
  id: number;
  occurredOn: string;
  amount: number;
  memo: string | null;
  categoryName: string;
}

interface SharedExpenseRow extends RowDataPacket {
  userId: number;
  amount: number;
  payerSharePercent: number;
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

  // 이번 달 지출을 결제수단별로 나눈 합계. 결제수단을 안 고른 지출은 method = null("미지정")로 묶인다.
  const [paymentRows] = await pool.query<(RowDataPacket & { method: string | null; total: number })[]>(
    `SELECT payment_method AS method, SUM(amount) AS total
     FROM transactions
     WHERE household_id = ? AND type = 'expense' AND occurred_on >= ? AND occurred_on < ?
     GROUP BY payment_method
     ORDER BY total DESC`,
    [req.householdId, currentStart, currentEnd]
  );
  const paymentMethods = paymentRows.map((r) => ({ method: r.method, total: Number(r.total) }));

  res.json({ month, previousMonth, categories, daily, totals, paymentMethods });
});

// 연간 데이트 비용 통계. 데이트/기념일 카테고리(is_date)로 표시된 카테고리의 지출만 모은다.
// - monthly: 1~12월 각각의 합계와 건수 (데이트가 없던 달도 0으로 채워서 12개를 항상 내려준다)
// - categories: 데이트 카테고리별 합계 (데이트 vs 기념일 비중 보기용)
// - top: 그해 가장 큰 데이트 지출 5건 (기념일 선물 같은 "큰 한 방"을 돌아보는 용도)
// - previousYearTotal: 작년 같은 기준 합계 (작년 대비 증감)
router.get('/date-stats', async (req: Request, res: Response) => {
  await syncRecurringTransactions(req.householdId);
  const year = Number(req.query.year) || new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: { message: '연도를 확인해주세요.' } });
  }
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const previousStart = `${year - 1}-01-01`;

  const [monthlyRows] = await pool.query<DateMonthlyRow[]>(
    `SELECT MONTH(t.occurred_on) AS month, SUM(t.amount) AS total, COUNT(*) AS count
     FROM transactions t
     JOIN categories c ON c.id = t.category_id AND c.is_date = TRUE
     WHERE t.household_id = ? AND t.type = 'expense' AND t.occurred_on >= ? AND t.occurred_on < ?
     GROUP BY month`,
    [req.householdId, start, end]
  );
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const row = monthlyRows.find((r) => Number(r.month) === i + 1);
    return { month: i + 1, total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
  });

  const [categories] = await pool.query<DateCategoryRow[]>(
    `SELECT c.id AS categoryId, c.name AS categoryName, c.color AS categoryColor, SUM(t.amount) AS total
     FROM transactions t
     JOIN categories c ON c.id = t.category_id AND c.is_date = TRUE
     WHERE t.household_id = ? AND t.type = 'expense' AND t.occurred_on >= ? AND t.occurred_on < ?
     GROUP BY c.id, c.name, c.color
     ORDER BY total DESC`,
    [req.householdId, start, end]
  );

  const [top] = await pool.query<DateTopRow[]>(
    `SELECT t.id, t.occurred_on AS occurredOn, t.amount, t.memo, c.name AS categoryName
     FROM transactions t
     JOIN categories c ON c.id = t.category_id AND c.is_date = TRUE
     WHERE t.household_id = ? AND t.type = 'expense' AND t.occurred_on >= ? AND t.occurred_on < ?
     ORDER BY t.amount DESC, t.occurred_on DESC
     LIMIT 5`,
    [req.householdId, start, end]
  );

  const [[previous]] = await pool.query<(RowDataPacket & { total: number })[]>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN categories c ON c.id = t.category_id AND c.is_date = TRUE
     WHERE t.household_id = ? AND t.type = 'expense' AND t.occurred_on >= ? AND t.occurred_on < ?`,
    [req.householdId, previousStart, start]
  );

  res.json({
    year,
    total: monthly.reduce((sum, m) => sum + m.total, 0),
    count: monthly.reduce((sum, m) => sum + m.count, 0),
    previousYearTotal: Number(previous.total),
    monthly,
    // SUM() 결과가 DECIMAL이라 mysql2가 문자열로 줄 수 있어서 숫자로 확정한다.
    categories: categories.map((c) => ({ ...c, total: Number(c.total) })),
    top,
  });
});

// 이번 달 "누가 누구에게 얼마" 정산 (N명).
// - members[].paid: 그 사람이 이번 달에 낸 지출 전체(공동+개인 합친 금액) — "내가 얼마 썼나" 보여주는 용도.
// - members[].balance: 정산 기준 받을 돈(+) / 보낼 돈(-). 전원 합은 항상 0.
// - 실제 정산은 "공동 지출(split_type='shared')"만 갖고 계산한다. 개인 지출(personal)은
//   전부 낸 사람 혼자 부담하는 거라 정산 대상에서 빠진다.
// - 건별로 누가 얼마씩 부담하는지(2명이면 낸 사람 payer_share_percent% : 상대, 3명 이상이면
//   기본값 50%는 균등 분할 등)는 utils/settlement.ts의 규칙을 따른다.
// - settlements: 송금 목록. 가장 많이 받을 사람과 가장 많이 보낼 사람을 짝지어 최대 (인원-1)번으로 끝난다.
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

  // SUM()은 DECIMAL이라 mysql2가 문자열로 줄 수 있어서 숫자로 확정한다.
  const memberPaid = members.map((m) => ({ userId: m.userId, userName: m.userName, paid: Number(m.paid) }));
  const totalExpense = memberPaid.reduce((sum, m) => sum + m.paid, 0);
  const memberIds = memberPaid.map((m) => m.userId);

  // is_settled = FALSE: "더치페이"로 이미 그때그때 정산해버린 건은 여기서 또 계산하면
  // 중복으로 잡히니 빼야 한다.
  const [sharedExpenses] = await pool.query<SharedExpenseRow[]>(
    `SELECT user_id AS userId, amount, payer_share_percent AS payerSharePercent
     FROM transactions
     WHERE household_id = ? AND type = 'expense' AND split_type = 'shared' AND is_settled = FALSE
       AND occurred_on >= ? AND occurred_on < ?`,
    [req.householdId, start, end]
  );

  const balances = computeBalances(sharedExpenses, memberIds);
  const nameOf = new Map(memberPaid.map((m) => [m.userId, m.userName]));
  const settlements = computeTransfers(balances).map((t) => ({
    fromUserId: t.fromUserId,
    fromUserName: nameOf.get(t.fromUserId)!,
    toUserId: t.toUserId,
    toUserName: nameOf.get(t.toUserId)!,
    amount: t.amount,
  }));

  res.json({
    month,
    members: memberPaid.map((m) => ({ ...m, balance: balances.get(m.userId) ?? 0 })),
    totalExpense,
    settlements,
  });
});

export default router;
