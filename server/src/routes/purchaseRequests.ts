import { Request, Response, Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireHouseholdMember } from '../middlewares/household.js';
import { parseSplit, SplitType } from '../utils/split.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireHouseholdMember);

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'purchased';

interface PurchaseRequestRow extends RowDataPacket {
  id: number;
  title: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  splitType: SplitType;
  payerSharePercent: number;
  status: RequestStatus;
  requesterId: number;
  requesterName: string;
  responderName: string | null;
  responseNote: string | null;
  respondedAt: string | null;
  createdAt: string;
}

interface CreateBody {
  title?: string;
  amount?: number;
  categoryId?: number | null;
  splitType?: string;
  payerSharePercent?: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 대기 중인 요청은 전부, 이미 끝난 요청(승인/거절/취소/구매)은 최근 2주 것만 보여준다.
// 오래된 결과까지 계속 쌓아 보여주면 대시보드가 지저분해진다.
router.get('/', async (req: Request, res: Response) => {
  const [rows] = await pool.query<PurchaseRequestRow[]>(
    `SELECT p.id, p.title, p.amount, p.category_id AS categoryId, c.name AS categoryName,
            p.split_type AS splitType, p.payer_share_percent AS payerSharePercent, p.status,
            p.requester_id AS requesterId, ru.name AS requesterName,
            su.name AS responderName, p.response_note AS responseNote,
            p.responded_at AS respondedAt, p.created_at AS createdAt
     FROM purchase_requests p
     JOIN users ru ON ru.id = p.requester_id
     LEFT JOIN users su ON su.id = p.responder_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.household_id = ?
       AND (p.status IN ('pending', 'approved') OR p.created_at >= NOW() - INTERVAL 14 DAY)
     ORDER BY CASE p.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, p.created_at DESC
     LIMIT 30`,
    [req.householdId]
  );
  res.json({ requests: rows });
});

router.post('/', async (req: Request<{}, {}, CreateBody>, res: Response) => {
  const title = req.body.title?.trim();
  const { amount, categoryId } = req.body;
  if (!title || title.length > 100 || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: { message: '무엇을 살지(메모)와 금액을 확인해주세요.' } });
  }
  const split = parseSplit(req.body);
  if (!split.ok) {
    return res.status(400).json({ error: { message: split.message } });
  }

  // 물어볼 상대가 없으면(혼자 쓰는 가계부) 요청이 영원히 대기 상태로 남으니 막는다.
  const [[{ memberCount }]] = await pool.query<(RowDataPacket & { memberCount: number })[]>(
    'SELECT COUNT(*) AS memberCount FROM household_members WHERE household_id = ?',
    [req.householdId]
  );
  if (Number(memberCount) < 2) {
    return res.status(400).json({ error: { message: '파트너가 가계부에 참여해야 물어볼 수 있어요.' } });
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO purchase_requests
       (household_id, requester_id, title, amount, category_id, split_type, payer_share_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      req.householdId,
      req.userId,
      title,
      amount,
      categoryId || null,
      split.value.splitType,
      split.value.payerSharePercent,
    ]
  );
  res.status(201).json({ id: result.insertId });
});

// 승인/거절. 요청한 본인은 자기 요청에 답할 수 없고, 대기 중인 요청에만 답할 수 있다.
// 조건을 UPDATE의 WHERE에 다 넣어서, 둘이 동시에 눌러도 한 번만 반영되게 한다.
router.post(
  '/:id/respond',
  async (req: Request<{ id: string }, {}, { decision?: string; note?: string | null }>, res: Response) => {
    const { decision } = req.body;
    if (decision !== 'approved' && decision !== 'rejected') {
      return res.status(400).json({ error: { message: '승인 또는 거절을 선택해주세요.' } });
    }
    const note = req.body.note?.trim() || null;
    if (note && note.length > 255) {
      return res.status(400).json({ error: { message: '한마디는 255자 이내로 적어주세요.' } });
    }

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE purchase_requests
       SET status = ?, responder_id = ?, response_note = ?, responded_at = NOW()
       WHERE id = ? AND household_id = ? AND status = 'pending' AND requester_id <> ?`,
      [decision, req.userId, note, req.params.id, req.householdId, req.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: { message: '이미 처리됐거나 답할 수 없는 요청입니다.' } });
    }
    res.status(204).end();
  }
);

router.post('/:id/cancel', async (req: Request<{ id: string }>, res: Response) => {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE purchase_requests SET status = 'cancelled'
     WHERE id = ? AND household_id = ? AND requester_id = ? AND status IN ('pending', 'approved')`,
    [req.params.id, req.householdId, req.userId]
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: { message: '취소할 수 없는 요청입니다.' } });
  }
  res.status(204).end();
});

// 승인받은 걸 실제로 샀을 때, 요청 내용 그대로 지출로 기록한다. 실제 결제 금액이 달라졌으면 amount로 덮어쓴다.
// 날짜는 서버(UTC)가 아니라 사용자 기준 오늘을 클라이언트가 보낸다.
router.post(
  '/:id/purchase',
  async (req: Request<{ id: string }, {}, { occurredOn?: string; amount?: number }>, res: Response) => {
    const { occurredOn, amount } = req.body;
    if (!occurredOn || !DATE_PATTERN.test(occurredOn)) {
      return res.status(400).json({ error: { message: '날짜를 확인해주세요.' } });
    }
    if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
      return res.status(400).json({ error: { message: '금액을 확인해주세요.' } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[request]] = await conn.query<PurchaseRequestRow[]>(
        `SELECT title, amount, category_id AS categoryId, split_type AS splitType,
                payer_share_percent AS payerSharePercent
         FROM purchase_requests
         WHERE id = ? AND household_id = ? AND requester_id = ? AND status = 'approved'
         FOR UPDATE`,
        [req.params.id, req.householdId, req.userId]
      );
      if (!request) {
        await conn.rollback();
        return res.status(409).json({ error: { message: '승인된 내 요청만 구매 기록할 수 있습니다.' } });
      }

      const [inserted] = await conn.query<ResultSetHeader>(
        `INSERT INTO transactions
           (household_id, user_id, category_id, type, amount, memo, occurred_on, split_type, payer_share_percent)
         VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?)`,
        [
          req.householdId,
          req.userId,
          request.categoryId,
          amount ?? request.amount,
          request.title,
          occurredOn,
          request.splitType,
          request.payerSharePercent,
        ]
      );
      await conn.query(`UPDATE purchase_requests SET status = 'purchased', transaction_id = ? WHERE id = ?`, [
        inserted.insertId,
        req.params.id,
      ]);

      await conn.commit();
      res.status(201).json({ transactionId: inserted.insertId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
);

export default router;
