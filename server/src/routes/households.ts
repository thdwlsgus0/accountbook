import { Request, Response, Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';

const router = Router();
router.use(requireAuth);

interface HouseholdRow extends RowDataPacket {
  id: number;
  name: string;
  invite_code: string;
}

interface MembershipRow extends RowDataPacket {
  id: number;
}

interface CountRow extends RowDataPacket {
  count: number;
}

interface MyHouseholdRow extends RowDataPacket {
  id: number;
  name: string;
  inviteCode: string;
  role: 'owner' | 'member';
}

interface MemberDetailRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'member';
}

// 커플 가계부이므로 기본 카테고리를 미리 채워둔다 — 매번 처음부터 카테고리를
// 직접 만들지 않아도 바로 기록을 시작할 수 있게 하는 것이 "실용성"의 핵심.
const DEFAULT_CATEGORIES: Array<{ name: string; type: 'income' | 'expense'; color: string }> = [
  { name: '식비', type: 'expense', color: '#f97362' },
  { name: '카페/간식', type: 'expense', color: '#f6b93b' },
  { name: '교통', type: 'expense', color: '#4a90d9' },
  { name: '데이트', type: 'expense', color: '#e879b9' },
  { name: '문화/여가', type: 'expense', color: '#9b6bd6' },
  { name: '쇼핑', type: 'expense', color: '#3fb9a8' },
  { name: '주거/통신', type: 'expense', color: '#6b7280' },
  { name: '의료/건강', type: 'expense', color: '#2ecc71' },
  { name: '경조사', type: 'expense', color: '#a0522d' },
  { name: '기타', type: 'expense', color: '#95a5a6' },
  { name: '월급', type: 'income', color: '#2f9e44' },
  { name: '용돈', type: 'income', color: '#1c7ed6' },
  { name: '부수입', type: 'income', color: '#087f5b' },
  { name: '기타수입', type: 'income', color: '#495057' },
];

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.post('/', async (req: Request<{}, {}, { name?: string }>, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: { message: '가계부 이름을 입력해주세요.' } });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const [dup] = await conn.query<RowDataPacket[]>('SELECT id FROM households WHERE invite_code = ?', [
        inviteCode,
      ]);
      if (dup.length === 0) break;
      inviteCode = generateInviteCode();
    }

    const [result] = await conn.query<ResultSetHeader>('INSERT INTO households (name, invite_code) VALUES (?, ?)', [
      name,
      inviteCode,
    ]);
    const householdId = result.insertId;

    await conn.query('INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, ?)', [
      householdId,
      req.userId,
      'owner',
    ]);

    for (const cat of DEFAULT_CATEGORIES) {
      await conn.query('INSERT INTO categories (household_id, name, type, color) VALUES (?, ?, ?, ?)', [
        householdId,
        cat.name,
        cat.type,
        cat.color,
      ]);
    }

    await conn.commit();
    res.status(201).json({ id: householdId, name, inviteCode });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

router.post('/join', async (req: Request<{}, {}, { inviteCode?: string }>, res: Response) => {
  const { inviteCode } = req.body;
  if (!inviteCode) {
    return res.status(400).json({ error: { message: '초대 코드를 입력해주세요.' } });
  }

  const [households] = await pool.query<HouseholdRow[]>('SELECT * FROM households WHERE invite_code = ?', [
    inviteCode.toUpperCase(),
  ]);
  const household = households[0];
  if (!household) {
    return res.status(404).json({ error: { message: '유효하지 않은 초대 코드입니다.' } });
  }

  const [existing] = await pool.query<MembershipRow[]>(
    'SELECT id FROM household_members WHERE household_id = ? AND user_id = ?',
    [household.id, req.userId]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: { message: '이미 참여 중인 가계부입니다.' } });
  }

  const [[{ count }]] = await pool.query<CountRow[]>(
    'SELECT COUNT(*) AS count FROM household_members WHERE household_id = ?',
    [household.id]
  );
  if (count >= 2) {
    return res.status(409).json({ error: { message: '이 가계부는 이미 인원이 가득 찼습니다. (최대 2인)' } });
  }

  await pool.query('INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, ?)', [
    household.id,
    req.userId,
    'member',
  ]);

  res.status(201).json({ id: household.id, name: household.name, inviteCode: household.invite_code });
});

router.get('/mine', async (req: Request, res: Response) => {
  const [rows] = await pool.query<MyHouseholdRow[]>(
    `SELECT h.id, h.name, h.invite_code AS inviteCode, hm.role
     FROM households h
     JOIN household_members hm ON hm.household_id = h.id
     WHERE hm.user_id = ?
     ORDER BY h.created_at ASC`,
    [req.userId]
  );
  res.json({ households: rows });
});

router.get('/:householdId', requireHouseholdMember, async (req: Request, res: Response) => {
  const [members] = await pool.query<MemberDetailRow[]>(
    `SELECT u.id, u.name, u.email, hm.role
     FROM household_members hm
     JOIN users u ON u.id = hm.user_id
     WHERE hm.household_id = ?`,
    [req.householdId]
  );
  const [[household]] = await pool.query<HouseholdRow[]>(
    'SELECT id, name, invite_code AS inviteCode FROM households WHERE id = ?',
    [req.householdId]
  );
  res.json({ ...household, members });
});

export default router;
