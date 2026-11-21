import { NextFunction, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';

interface MemberRow extends RowDataPacket {
  role: 'owner' | 'member';
}

// 구성원 확인 결과를 서버 인스턴스 안에 잠깐 기억한다. 대시보드 하나에 요청이 10개쯤 나가는데
// 그때마다 같은 확인 쿼리를 치지 않게 하려는 것. "구성원이다"라는 결과만 기억하고(아니면 매번 확인),
// 가계부에서 내보내기/나가기 기능은 아직 없어서 1분 동안 기억해도 권한이 남는 문제는 없다.
// 나중에 구성원 제거 기능을 만들면 그때 forgetMembership을 같이 불러야 한다.
const MEMBER_CACHE_MS = 60_000;
const memberCache = new Map<string, { role: 'owner' | 'member'; expiresAt: number }>();

export function forgetMembership(householdId: number, userId: number): void {
  memberCache.delete(`${householdId}:${userId}`);
}

// 요청한 사용자가 해당 가계부(household)의 구성원인지 확인한다.
// 커플 가계부는 구성원이 아닌 사람은 아무 데이터도 볼 수 없어야 하므로,
// household_id가 URL에 들어오는 모든 라우트 앞단에서 이 미들웨어를 거치게 한다.
export async function requireHouseholdMember(req: Request, res: Response, next: NextFunction) {
  const householdId = Number(req.params.householdId);
  if (!householdId) {
    return res.status(400).json({ error: { message: '잘못된 요청입니다.' } });
  }

  const key = `${householdId}:${req.userId}`;
  const cached = memberCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    req.householdId = householdId;
    req.householdRole = cached.role;
    return next();
  }

  const [rows] = await pool.query<MemberRow[]>(
    'SELECT role FROM household_members WHERE household_id = ? AND user_id = ?',
    [householdId, req.userId]
  );
  if (rows.length === 0) {
    memberCache.delete(key);
    return res.status(403).json({ error: { message: '이 가계부에 접근할 권한이 없습니다.' } });
  }

  memberCache.set(key, { role: rows[0].role, expiresAt: Date.now() + MEMBER_CACHE_MS });
  req.householdId = householdId;
  req.householdRole = rows[0].role;
  next();
}
