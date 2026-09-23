import { NextFunction, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';

interface MemberRow extends RowDataPacket {
  role: 'owner' | 'member';
}

// 요청한 사용자가 해당 가계부(household)의 구성원인지 확인한다.
// 커플 가계부는 구성원이 아닌 사람은 아무 데이터도 볼 수 없어야 하므로,
// household_id가 URL에 들어오는 모든 라우트 앞단에서 이 미들웨어를 거치게 한다.
export async function requireHouseholdMember(req: Request, res: Response, next: NextFunction) {
  const householdId = Number(req.params.householdId);
  if (!householdId) {
    return res.status(400).json({ error: { message: '잘못된 요청입니다.' } });
  }

  const [rows] = await pool.query<MemberRow[]>(
    'SELECT role FROM household_members WHERE household_id = ? AND user_id = ?',
    [householdId, req.userId]
  );
  if (rows.length === 0) {
    return res.status(403).json({ error: { message: '이 가계부에 접근할 권한이 없습니다.' } });
  }

  req.householdId = householdId;
  req.householdRole = rows[0].role;
  next();
}
