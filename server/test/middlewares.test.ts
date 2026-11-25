import { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb } from './helpers/fakeDb.js';

vi.mock('../src/config/db.js', async () => ({ pool: (await import('./helpers/fakeDb.js')).fakeDb.pool }));

const { requireAuth } = await import('../src/middlewares/auth.js');
const { requireHouseholdMember } = await import('../src/middlewares/household.js');
const { signToken } = await import('../src/utils/jwt.js');

// 미들웨어가 쓰는 res.status(...).json(...)만 흉내 낸 가짜 응답
function fakeRes() {
  const state = { statusCode: 200, body: undefined as unknown };
  const res = {
    status: vi.fn((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      state.body = body;
      return res;
    }),
    get statusCode() {
      return state.statusCode;
    },
  };
  return res as unknown as Response;
}

describe('requireAuth', () => {
  it('토큰이 없으면 401', () => {
    const res = fakeRes();
    const next = vi.fn();
    requireAuth({ headers: {} } as Request, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('잘못된 토큰이면 401', () => {
    const res = fakeRes();
    requireAuth({ headers: { authorization: 'Bearer nope' } } as Request, res, vi.fn());
    expect(res.statusCode).toBe(401);
  });

  it('올바른 토큰이면 req.userId를 채우고 통과', () => {
    const req = { headers: { authorization: `Bearer ${signToken({ userId: 3 })}` } } as Request;
    const next = vi.fn();
    requireAuth(req, fakeRes(), next);
    expect(req.userId).toBe(3);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireHouseholdMember', () => {
  beforeEach(() => fakeDb.reset());

  const run = async (householdId: string, userId: number) => {
    const req = { params: { householdId }, userId } as unknown as Request;
    const res = fakeRes();
    const next = vi.fn() as NextFunction;
    await requireHouseholdMember(req, res, next);
    return { req, res, next };
  };

  it('가계부 id가 숫자가 아니면 400', async () => {
    const { res } = await run('abc', 1);
    expect(res.statusCode).toBe(400);
  });

  it('구성원이 아니면 403이고, 그 결과는 기억하지 않는다 (매번 다시 확인)', async () => {
    fakeDb.on(/FROM household_members/, []);
    expect((await run('10', 1)).res.statusCode).toBe(403);
    expect((await run('10', 1)).res.statusCode).toBe(403);
    expect(fakeDb.callsMatching(/FROM household_members/)).toHaveLength(2);
  });

  it('구성원이면 통과하고, 1분 동안은 같은 확인 쿼리를 다시 치지 않는다', async () => {
    fakeDb.on(/FROM household_members/, [{ role: 'member' }]);
    const first = await run('20', 1);
    const second = await run('20', 1);
    expect(first.next).toHaveBeenCalled();
    expect(second.req.householdRole).toBe('member');
    expect(fakeDb.callsMatching(/FROM household_members/)).toHaveLength(1);
  });

  it('같은 가계부라도 다른 사람은 따로 확인한다', async () => {
    fakeDb.on(/FROM household_members/, [{ role: 'member' }]);
    await run('30', 1);
    await run('30', 2);
    expect(fakeDb.callsMatching(/FROM household_members/)).toHaveLength(2);
  });
});
