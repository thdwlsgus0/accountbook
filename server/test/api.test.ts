import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb, ok, useDefaultHandlers } from './helpers/fakeDb.js';

// DB는 가짜 pool로, 서버 시작 시 스키마 맞추기(migrate)는 건너뛴다.
vi.mock('../src/config/db.js', async () => ({ pool: (await import('./helpers/fakeDb.js')).fakeDb.pool }));
vi.mock('../src/db/migrate.js', () => ({ ensureSchema: () => Promise.resolve() }));

const { default: app } = await import('../src/app.js');
const { signToken } = await import('../src/utils/jwt.js');

const H = 1; // 가계부 id
const ME = 10;
const auth = { Authorization: `Bearer ${signToken({ userId: ME })}` };
const base = `/api/households/${H}`;

beforeEach(() => {
  fakeDb.reset();
  useDefaultHandlers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('공통', () => {
  it('로그인 안 하면 401', async () => {
    const res = await request(app).get(`${base}/transactions`);
    expect(res.status).toBe(401);
  });

  it('상태 확인은 DB 왕복 시간을 알려준다', async () => {
    fakeDb.on(/^SELECT 1$/, [{ 1: 1 }]);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'connected' });
    expect(typeof res.body.dbRoundTripMs).toBe('number');
    expect(res.headers['server-timing']).toMatch(/^app;dur=/);
  });

  it('처리 중 에러가 나면 500과 안내 문구 (에러 내용은 밖으로 내보내지 않음)', async () => {
    fakeDb.on(/FROM transactions t/, () => {
      throw new Error('secret db detail');
    });
    const res = await request(app).get(`${base}/transactions`).set(auth);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});

describe('POST /transactions (기록하기)', () => {
  const valid = { type: 'expense', amount: 12500, occurredOn: '2026-11-25', memo: '스타벅스' };

  it.each([
    ['금액이 없음', { ...valid, amount: undefined }],
    ['금액이 0', { ...valid, amount: 0 }],
    ['날짜가 없음', { ...valid, occurredOn: undefined }],
    ['종류가 이상함', { ...valid, type: 'gift' }],
    ['분담 비율이 범위 밖', { ...valid, splitType: 'shared', payerSharePercent: 100 }],
    ['결제수단이 이상함', { ...valid, paymentMethod: 'bitcoin' }],
  ])('%s → 400, DB에 쓰지 않는다', async (_name, body) => {
    const res = await request(app).post(`${base}/transactions`).set(auth).send(body);
    expect(res.status).toBe(400);
    expect(fakeDb.callsMatching(/INSERT INTO transactions/)).toHaveLength(0);
  });

  it('지출을 기록하고 새 id를 돌려준다 (작성자는 로그인한 사람)', async () => {
    fakeDb.on(/INSERT INTO transactions/, ok({ insertId: 77 }));
    const res = await request(app)
      .post(`${base}/transactions`)
      .set(auth)
      .send({ ...valid, paymentMethod: 'card', splitType: 'shared', payerSharePercent: 60 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 77 });
    const [insert] = fakeDb.callsMatching(/INSERT INTO transactions/);
    expect(insert.params).toEqual([H, ME, null, 'expense', 12500, '스타벅스', '2026-11-25', 'shared', 60, 'card']);
  });

  it('수입은 결제수단을 저장하지 않는다', async () => {
    fakeDb.on(/INSERT INTO transactions/, ok());
    await request(app)
      .post(`${base}/transactions`)
      .set(auth)
      .send({ type: 'income', amount: 3000000, occurredOn: '2026-11-25', paymentMethod: 'card' });
    const [insert] = fakeDb.callsMatching(/INSERT INTO transactions/);
    expect(insert.params.at(-1)).toBeNull();
  });
});

describe('GET /transactions/search (검색)', () => {
  const row = (id: number, memo: string, type = 'expense', amount = 10000) => ({
    id,
    memo,
    type,
    amount,
    hasReceipt: 0,
  });

  it('#여행으로 찾으면 #여행지는 빼고, 건수·합계를 계산한다', async () => {
    fakeDb.on(/LIMIT 5000/, [row(1, '흑돼지 #여행', 'expense', 30000), row(2, '숙소 #여행지', 'expense', 90000), row(3, '#여행 환불', 'income', 5000)]);
    const res = await request(app).get(`${base}/transactions/search`).query({ tag: '여행' }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.transactions.map((t: { id: number }) => t.id)).toEqual([1, 3]);
    expect(res.body).toMatchObject({ count: 2, expense: 30000, income: 5000, truncated: false });
    expect(res.body.transactions[0].hasReceipt).toBe(false);
  });

  it('검색어의 %, _는 LIKE 와일드카드가 아니라 글자로 찾는다', async () => {
    fakeDb.on(/LIMIT 5000/, []);
    await request(app).get(`${base}/transactions/search`).query({ q: '50%_할인' }).set(auth);
    const [call] = fakeDb.callsMatching(/LIMIT 5000/);
    expect(call.params).toContain('%50\\%\\_할인%');
  });

  it('준 조건만 SQL에 들어가고, 잘못된 값은 무시한다', async () => {
    fakeDb.on(/LIMIT 5000/, []);
    await request(app)
      .get(`${base}/transactions/search`)
      .query({ from: '2026-11-01', to: 'not-a-date', min: '1000', type: 'gift', categoryId: 'none', paymentMethod: 'cash' })
      .set(auth);
    const [call] = fakeDb.callsMatching(/LIMIT 5000/);
    expect(call.sql).toContain('t.occurred_on >= ?');
    expect(call.sql).not.toContain('t.occurred_on <= ?');
    expect(call.sql).toContain('t.amount >= ?');
    expect(call.sql).not.toContain('t.type = ?');
    expect(call.sql).toContain('t.category_id IS NULL');
    expect(call.sql).toContain('t.payment_method = ?');
    expect(call.params).toEqual([H, '2026-11-01', 1000, 'cash']);
  });

  it('300건이 넘으면 목록은 300건만, truncated로 알려준다', async () => {
    fakeDb.on(/LIMIT 5000/, Array.from({ length: 301 }, (_, i) => row(i, `메모${i}`)));
    const res = await request(app).get(`${base}/transactions/search`).query({ q: '메모' }).set(auth);
    expect(res.body.transactions).toHaveLength(300);
    expect(res.body).toMatchObject({ count: 301, truncated: true });
  });
});

describe('GET /transactions/tags', () => {
  it('태그별 건수·지출 합계, 많이 쓴 순', async () => {
    fakeDb.on(/memo LIKE '%#%'/, [
      { memo: '#여행 흑돼지', type: 'expense', amount: 30000 },
      { memo: '#여행 #생일', type: 'expense', amount: 50000 },
      { memo: '#생일 축하금', type: 'income', amount: 100000 },
      { memo: '#여행 숙소', type: 'expense', amount: 90000 },
    ]);
    const res = await request(app).get(`${base}/transactions/tags`).set(auth);
    expect(res.body.tags).toEqual([
      { tag: '여행', count: 3, expense: 170000 },
      { tag: '생일', count: 2, expense: 50000 },
    ]);
  });
});

describe('영수증 사진', () => {
  it('이미지가 아니면 400', async () => {
    const res = await request(app)
      .put(`${base}/transactions/5/receipt`)
      .set(auth)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('pdf'));
    expect(res.status).toBe(400);
  });

  it('3MB가 넘으면 413', async () => {
    const res = await request(app)
      .put(`${base}/transactions/5/receipt`)
      .set(auth)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(3 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
    expect(res.body.error.message).toBe('파일이 너무 큽니다.');
  });

  it('다른 가계부의 거래에는 붙일 수 없다 (404)', async () => {
    fakeDb.on(/SELECT id FROM transactions WHERE id = \? AND household_id = \?/, []);
    const res = await request(app)
      .put(`${base}/transactions/5/receipt`)
      .set(auth)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff]));
    expect(res.status).toBe(404);
    expect(fakeDb.callsMatching(/INSERT INTO transaction_receipts/)).toHaveLength(0);
  });
});

describe('템플릿 원탭 기록', () => {
  it('날짜 형식이 틀리면 400', async () => {
    const res = await request(app).post(`${base}/templates/3/use`).set(auth).send({ occurredOn: '11/25' });
    expect(res.status).toBe(400);
  });

  it('템플릿 내용 그대로, 누른 사람이 낸 사람으로 기록한다', async () => {
    fakeDb.on(/FROM expense_templates\s+WHERE id = \?/, [
      { name: '아메리카노 2잔', amount: 9000, categoryId: 2, splitType: 'shared', payerSharePercent: 50, paymentMethod: 'naverpay' },
    ]);
    fakeDb.on(/INSERT INTO transactions/, ok({ insertId: 55 }));
    const res = await request(app).post(`${base}/templates/3/use`).set(auth).send({ occurredOn: '2026-11-25' });
    expect(res.status).toBe(201);
    const [insert] = fakeDb.callsMatching(/INSERT INTO transactions/);
    expect(insert.params).toEqual([H, ME, 2, 9000, '아메리카노 2잔', '2026-11-25', 'shared', 50, 'naverpay']);
  });

  it('없는 템플릿이면 404', async () => {
    fakeDb.on(/FROM expense_templates\s+WHERE id = \?/, []);
    const res = await request(app).post(`${base}/templates/3/use`).set(auth).send({ occurredOn: '2026-11-25' });
    expect(res.status).toBe(404);
  });
});

describe('"이거 사도 될까?" 요청', () => {
  it('혼자 쓰는 가계부면 물어볼 수 없다', async () => {
    fakeDb.on(/COUNT\(\*\) AS memberCount/, [{ memberCount: 1 }]);
    const res = await request(app).post(`${base}/purchase-requests`).set(auth).send({ title: '에어팟', amount: 300000 });
    expect(res.status).toBe(400);
    expect(fakeDb.callsMatching(/INSERT INTO purchase_requests/)).toHaveLength(0);
  });

  it('승인/거절 말고 다른 답은 400', async () => {
    const res = await request(app).post(`${base}/purchase-requests/4/respond`).set(auth).send({ decision: 'maybe' });
    expect(res.status).toBe(400);
  });

  it('본인 요청이거나 이미 처리된 요청이면 409 (조건이 UPDATE에 걸려 있다)', async () => {
    fakeDb.on(/UPDATE purchase_requests\s+SET status = \?/, ok({ affectedRows: 0 }));
    const res = await request(app).post(`${base}/purchase-requests/4/respond`).set(auth).send({ decision: 'approved' });
    expect(res.status).toBe(409);
    const [update] = fakeDb.callsMatching(/UPDATE purchase_requests\s+SET status = \?/);
    expect(update.sql).toContain("status = 'pending' AND requester_id <> ?");
    expect(update.params).toEqual(['approved', ME, null, '4', H, ME]);
  });

  it('승인된 내 요청을 "샀어요"로 기록하면 한 트랜잭션으로 지출을 만들고 상태를 바꾼다', async () => {
    fakeDb.on(/FROM purchase_requests\s+WHERE id = \? AND household_id = \? AND requester_id = \? AND status = 'approved'/, [
      { title: '에어팟', amount: 300000, categoryId: 6, splitType: 'shared', payerSharePercent: 50 },
    ]);
    fakeDb.on(/INSERT INTO transactions/, ok({ insertId: 88 }));
    fakeDb.on(/SET status = 'purchased'/, ok());
    const res = await request(app)
      .post(`${base}/purchase-requests/4/purchase`)
      .set(auth)
      .send({ occurredOn: '2026-11-25', amount: 289000 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ transactionId: 88 });
    const [insert] = fakeDb.callsMatching(/INSERT INTO transactions/);
    expect(insert.params).toContain(289000); // 실제 결제 금액으로 덮어씀
    expect(fakeDb.connection.commit).toHaveBeenCalled();
  });

  it('승인 안 된 요청이면 409이고 아무것도 쓰지 않는다 (롤백)', async () => {
    fakeDb.on(/FROM purchase_requests\s+WHERE id = \?/, []);
    const res = await request(app).post(`${base}/purchase-requests/4/purchase`).set(auth).send({ occurredOn: '2026-11-25' });
    expect(res.status).toBe(409);
    expect(fakeDb.connection.rollback).toHaveBeenCalled();
    expect(fakeDb.callsMatching(/INSERT INTO transactions/)).toHaveLength(0);
  });
});

describe('GET /summary/settlement (이번 달 정산)', () => {
  it('공동 지출로 구성원별 받을/보낼 돈과 송금 목록을 만든다', async () => {
    fakeDb.on(/FROM household_members hm/, [
      { userId: 1, userName: '지수', paid: 90000 },
      { userId: 2, userName: '민호', paid: 30000 },
      { userId: 3, userName: '서연', paid: 0 },
    ]);
    fakeDb.on(/split_type = 'shared' AND is_settled = FALSE/, [
      { userId: 1, amount: 90000, payerSharePercent: 50 },
      { userId: 2, amount: 30000, payerSharePercent: 50 },
    ]);
    const res = await request(app).get(`${base}/summary/settlement`).query({ month: '2026-11' }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.totalExpense).toBe(120000);
    expect(res.body.members.map((m: { balance: number }) => m.balance)).toEqual([50000, -10000, -40000]);
    expect(res.body.settlements).toEqual([
      { fromUserId: 3, fromUserName: '서연', toUserId: 1, toUserName: '지수', amount: 40000 },
      { fromUserId: 2, fromUserName: '민호', toUserId: 1, toUserName: '지수', amount: 10000 },
    ]);
  });
});
