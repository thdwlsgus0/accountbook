import { Request, Response, Router } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/db.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireHouseholdMember } from "../middlewares/household.js";
import { currentYearMonth } from "../utils/date.js";
import { parseSplit, SplitType } from "../utils/split.js";

const router = Router({ mergeParams: true });
router.use(requireAuth, requireHouseholdMember);

interface RecurringRow extends RowDataPacket {
  id: number;
  type: "income" | "expense";
  amount: number;
  memo: string | null;
  dayOfMonth: number;
  isActive: boolean;
  categoryId: number | null;
  categoryName: string | null;
  splitType: SplitType;
  payerSharePercent: number;
}

interface RecurringBody {
  type?: "income" | "expense";
  amount?: number;
  categoryId?: number | null;
  memo?: string | null;
  dayOfMonth?: number;
  splitType?: string;
  payerSharePercent?: number;
}

router.get("/", async (req: Request, res: Response) => {
  const [rows] = await pool.query<RecurringRow[]>(
    `SELECT r.id, r.type, r.amount, r.memo, r.day_of_month AS dayOfMonth,
            r.is_active AS isActive, r.category_id AS categoryId, c.name AS categoryName,
            r.split_type AS splitType, r.payer_share_percent AS payerSharePercent
     FROM recurring_transactions r
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.household_id = ?
     ORDER BY r.day_of_month`,
    [req.householdId],
  );
  res.json({ recurring: rows });
});

router.post("/", async (req: Request<{}, {}, RecurringBody>, res: Response) => {
  const { type, amount, categoryId, memo, dayOfMonth } = req.body;
  if (
    !type ||
    !["income", "expense"].includes(type) ||
    !amount ||
    amount <= 0
  ) {
    return res
      .status(400)
      .json({ error: { message: "종류와 금액을 확인해주세요." } });
  }
  if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 28) {
    return res
      .status(400)
      .json({
        error: {
          message:
            "매월 반복일은 1~28일 사이로 설정해주세요. (모든 달에 존재하는 날짜)",
        },
      });
  }
  const split = parseSplit(req.body);
  if (!split.ok) {
    return res.status(400).json({ error: { message: split.message } });
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO recurring_transactions
       (household_id, user_id, category_id, type, amount, memo, day_of_month, start_month, split_type, payer_share_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.householdId,
      req.userId,
      categoryId || null,
      type,
      amount,
      memo || null,
      dayOfMonth,
      currentYearMonth(),
      split.value.splitType,
      split.value.payerSharePercent,
    ],
  );
  res.status(201).json({ id: result.insertId });
});

router.patch(
  "/:id",
  async (
    req: Request<{ id: string }, {}, { isActive?: boolean }>,
    res: Response,
  ) => {
    const { isActive } = req.body;
    await pool.query(
      "UPDATE recurring_transactions SET is_active = ? WHERE id = ? AND household_id = ?",
      [!!isActive, req.params.id, req.householdId],
    );
    res.status(204).end();
  },
);

router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  await pool.query(
    "DELETE FROM recurring_transactions WHERE id = ? AND household_id = ?",
    [req.params.id, req.householdId],
  );
  res.status(204).end();
});

export default router;
