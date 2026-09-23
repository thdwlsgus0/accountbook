import { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { signToken } from '../utils/jwt.js';

const router = Router();

interface UserRow extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  name: string;
}

interface SignupBody {
  email?: string;
  password?: string;
  name?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

router.post('/signup', async (req: Request<{}, {}, SignupBody>, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: { message: '이메일, 비밀번호, 이름을 모두 입력해주세요.' } });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: { message: '비밀번호는 8자 이상이어야 합니다.' } });
  }

  const [existing] = await pool.query<UserRow[]>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: { message: '이미 가입된 이메일입니다.' } });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
    [email, passwordHash, name]
  );

  const token = signToken({ userId: result.insertId });
  res.status(201).json({
    token,
    user: { id: result.insertId, email, name },
  });
});

router.post('/login', async (req: Request<{}, {}, LoginBody>, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: { message: '이메일과 비밀번호를 입력해주세요.' } });
  }

  const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: { message: '이메일 또는 비밀번호가 올바르지 않습니다.' } });
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: { message: '이메일 또는 비밀번호가 올바르지 않습니다.' } });
  }

  const token = signToken({ userId: user.id });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const [rows] = await pool.query<UserRow[]>('SELECT id, email, name FROM users WHERE id = ?', [req.userId]);
  if (rows.length === 0) {
    return res.status(404).json({ error: { message: '사용자를 찾을 수 없습니다.' } });
  }
  res.json({ user: rows[0] });
});

export default router;
