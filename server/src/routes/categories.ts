import { Request, Response, Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireHouseholdMember);

interface CategoryRow extends RowDataPacket {
  id: number;
  name: string;
  type: 'income' | 'expense';
  color: string;
  isDate: boolean;
}

interface CategoryBody {
  name?: string;
  type?: 'income' | 'expense';
  color?: string;
  isDate?: boolean;
}

router.get('/', async (req: Request, res: Response) => {
  const [rows] = await pool.query<CategoryRow[]>(
    'SELECT id, name, type, color, is_date AS isDate FROM categories WHERE household_id = ? ORDER BY type, id',
    [req.householdId]
  );
  // MySQL BOOLEAN은 0/1 숫자로 오므로 프론트 타입에 맞게 boolean으로 바꾼다.
  res.json({ categories: rows.map((r) => ({ ...r, isDate: !!r.isDate })) });
});

router.post('/', async (req: Request<{}, {}, CategoryBody>, res: Response) => {
  const { name, type, color } = req.body;
  // 데이트 카테고리는 지출에만 의미가 있다.
  const isDate = type === 'expense' && !!req.body.isDate;
  if (!name || !type || !['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: { message: '카테고리 이름과 종류(수입/지출)를 확인해주세요.' } });
  }
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO categories (household_id, name, type, color, is_date) VALUES (?, ?, ?, ?, ?)',
    [req.householdId, name, type, color || '#888888', isDate]
  );
  res.status(201).json({ id: result.insertId, name, type, color: color || '#888888', isDate });
});

// 데이트/기념일 카테고리 여부만 켜고 끈다 (통계 화면의 "데이트 카테고리 설정"에서 사용).
router.patch('/:id', async (req: Request<{ id: string }, {}, { isDate?: boolean }>, res: Response) => {
  if (typeof req.body.isDate !== 'boolean') {
    return res.status(400).json({ error: { message: '잘못된 요청입니다.' } });
  }
  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE categories SET is_date = ? WHERE id = ? AND household_id = ? AND type = 'expense'",
    [req.body.isDate, req.params.id, req.householdId]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: { message: '지출 카테고리를 찾을 수 없습니다.' } });
  }
  res.status(204).end();
});

router.delete('/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM categories WHERE id = ? AND household_id = ?', [
    req.params.id,
    req.householdId,
  ]);
  res.status(204).end();
});

export default router;
