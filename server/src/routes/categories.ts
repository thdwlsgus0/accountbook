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
}

interface CategoryBody {
  name?: string;
  type?: 'income' | 'expense';
  color?: string;
}

router.get('/', async (req: Request, res: Response) => {
  const [rows] = await pool.query<CategoryRow[]>(
    'SELECT id, name, type, color FROM categories WHERE household_id = ? ORDER BY type, id',
    [req.householdId]
  );
  res.json({ categories: rows });
});

router.post('/', async (req: Request<{}, {}, CategoryBody>, res: Response) => {
  const { name, type, color } = req.body;
  if (!name || !type || !['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: { message: '카테고리 이름과 종류(수입/지출)를 확인해주세요.' } });
  }
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO categories (household_id, name, type, color) VALUES (?, ?, ?, ?)',
    [req.householdId, name, type, color || '#888888']
  );
  res.status(201).json({ id: result.insertId, name, type, color: color || '#888888' });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM categories WHERE id = ? AND household_id = ?', [
    req.params.id,
    req.householdId,
  ]);
  res.status(204).end();
});

export default router;
