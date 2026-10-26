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

  res.json({ month, previousMonth, categories, daily, totals });
});

// 이번 달 "누가 얼마 더 냈는지" 정산.
// - members[].paid: 그 사람이 이번 달에 낸 지출 전체(공동+개인 합친 금액) — "내가 얼마 썼나" 보여주는 용도.
// - 실제 정산액은 "공동 지출(split_type='shared')"만 갖고 계산한다. 개인 지출(personal)은
//   전부 낸 사람 혼자 부담하는 거라 정산 대상에서 빠진다.
// - 공동 지출 한 건(amount)마다, 낸 사람(payer)은 payer_share_percent%만 자기 책임이고
//   나머지는 상대방 책임이다 (50%면 1:1, 60%면 6:4로 낸 사람이 더 많이 부담).
//   "실제로 낸 돈 - 자기 책임만큼" 을 다 더하면, 그게 상대방에게 받아야/줘야 할 금액이 된다.
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

  // 정산은 딱 2명일 때만 의미가 있다 (혼자면 나눌 상대가 없고, 가계부는 최대 2인이다).
  let settlement: { fromUserId: number; fromUserName: string; toUserId: number; toUserName: string; amount: number } | null =
    null;
  if (members.length === 2) {
    const [a, b] = members;

    // is_settled = FALSE: "더치페이"로 이미 그때그때 정산해버린 건은 여기서 또 계산하면
    // 중복으로 잡히니 빼야 한다.
    const [sharedExpenses] = await pool.query<SharedExpenseRow[]>(
      `SELECT user_id AS userId, amount, payer_share_percent AS payerSharePercent
       FROM transactions
       WHERE household_id = ? AND type = 'expense' AND split_type = 'shared' AND is_settled = FALSE
         AND occurred_on >= ? AND occurred_on < ?`,
      [req.householdId, start, end]
    );

    const responsibility: Record<number, number> = { [a.userId]: 0, [b.userId]: 0 };
    const sharedPaid: Record<number, number> = { [a.userId]: 0, [b.userId]: 0 };

    for (const tx of sharedExpenses) {
      const otherId = tx.userId === a.userId ? b.userId : a.userId;
      // payerShare + otherShare가 항상 amount와 정확히 같도록, otherShare는 빼기로 구한다
      // (각각 따로 반올림하면 거래가 많아질수록 1~2원씩 어긋날 수 있다).
      const payerShare = Math.round((tx.amount * tx.payerSharePercent) / 100);
      const otherShare = tx.amount - payerShare;
      responsibility[tx.userId] += payerShare;
      responsibility[otherId] += otherShare;
      sharedPaid[tx.userId] += tx.amount;
    }

    // a가 실제로 낸 공동 지출 금액에서 a의 책임만큼을 뺀 값.
    // 양수면 a가 자기 책임보다 더 많이 냈다는 뜻 -> b가 a에게 그만큼 보내면 된다.
    const balanceA = sharedPaid[a.userId] - responsibility[a.userId];
    const amount = Math.abs(balanceA);
    if (amount > 0) {
      settlement =
        balanceA > 0
          ? { fromUserId: b.userId, fromUserName: b.userName, toUserId: a.userId, toUserName: a.userName, amount }
          : { fromUserId: a.userId, fromUserName: a.userName, toUserId: b.userId, toUserName: b.userName, amount };
    }
  }

  res.json({ month, members, totalExpense, settlement });
});

export default router;
