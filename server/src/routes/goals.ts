import { Request, Response, Router } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireHouseholdMember);

interface GoalRow extends RowDataPacket {
  id: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
}

interface GoalBody {
  name?: string;
  targetAmount?: number;
  targetDate?: string | null;
}

interface ContributeBody {
  amount?: number;
  memo?: string | null;
}

router.get('/', async (req: Request, res: Response) => {
  const [rows] = await pool.query<GoalRow[]>(
    `SELECT id, name, target_amount AS targetAmount, current_amount AS currentAmount,
            target_date AS targetDate
     FROM savings_goals WHERE household_id = ? ORDER BY created_at DESC`,
    [req.householdId]
  );
  res.json({ goals: rows });
});

router.post('/', async (req: Request<{}, {}, GoalBody>, res: Response) => {
  const { name, targetAmount, targetDate } = req.body;
  if (!name || !targetAmount || targetAmount <= 0) {
    return res.status(400).json({ error: { message: '목표 이름과 목표 금액을 확인해주세요.' } });
  }
  const [result] = await pool.query(
    'INSERT INTO savings_goals (household_id, name, target_amount, target_date) VALUES (?, ?, ?, ?)',
    [req.householdId, name, targetAmount, targetDate || null]
  );
  res.status(201).json({ id: (result as { insertId: number }).insertId });
});

router.post('/:id/contribute', async (req: Request<{ id: string }, {}, ContributeBody>, res: Response) => {
  const { amount, memo } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: { message: '적립 금액은 0보다 커야 합니다.' } });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[goal]] = await conn.query<GoalRow[]>(
      'SELECT * FROM savings_goals WHERE id = ? AND household_id = ? FOR UPDATE',
      [req.params.id, req.householdId]
    );
    if (!goal) {
      await conn.rollback();
      return res.status(404).json({ error: { message: '목표를 찾을 수 없습니다.' } });
    }

    await conn.query(
      'INSERT INTO savings_goal_contributions (goal_id, user_id, amount, memo, contributed_on) VALUES (?, ?, ?, ?, CURDATE())',
      [goal.id, req.userId, amount, memo || null]
    );
    await conn.query('UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ?', [
      amount,
      goal.id,
    ]);

    await conn.commit();
    res.status(201).json({ currentAmount: goal.currentAmount + amount });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  await pool.query('DELETE FROM savings_goals WHERE id = ? AND household_id = ?', [
    req.params.id,
    req.householdId,
  ]);
  res.status(204).end();
});

export default router;
