import { vi } from 'vitest';

// 실제 MySQL 대신 쓰는 가짜 pool. 테스트가 "이런 SQL이 오면 이걸 돌려줘"를 등록하고,
// 등록 안 된 SQL이 오면 바로 에러를 내서 예상 못 한 쿼리가 나가는 것도 잡는다.
// 테스트 파일에서 이렇게 연결한다:
//   vi.mock('../src/config/db.js', async () => ({ pool: (await import('./helpers/fakeDb.js')).fakeDb.pool }));

export interface QueryCall {
  sql: string;
  params: unknown[];
}

type Reply = (params: unknown[]) => unknown;

interface Handler {
  match: RegExp;
  reply: Reply;
}

function createFakeDb() {
  let handlers: Handler[] = [];
  const calls: QueryCall[] = [];

  async function run(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    const handler = handlers.find((h) => h.match.test(sql));
    if (!handler) throw new Error(`fakeDb: 등록되지 않은 쿼리\n${sql}`);
    return [handler.reply(params), []];
  }

  const connection = {
    query: vi.fn(run),
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(() => {}),
  };

  return {
    pool: {
      query: vi.fn(run),
      getConnection: vi.fn(async () => connection),
    },
    connection,
    calls,
    // 나중에 등록한 것이 먼저 맞춰진다 (기본 응답을 테스트별로 덮어쓰기 쉽게).
    on(match: RegExp, reply: Reply | unknown) {
      handlers.unshift({ match, reply: typeof reply === 'function' ? (reply as Reply) : () => reply });
    },
    // 이 SQL과 맞는 호출만 골라본다.
    callsMatching(match: RegExp): QueryCall[] {
      return calls.filter((c) => match.test(c.sql));
    },
    reset() {
      handlers = [];
      calls.length = 0;
      this.pool.query.mockClear();
      connection.query.mockClear();
      connection.commit.mockClear();
      connection.rollback.mockClear();
    },
  };
}

export const fakeDb = createFakeDb();

// INSERT/UPDATE 결과(ResultSetHeader) 흉내
export const ok = (patch: { insertId?: number; affectedRows?: number } = {}) => ({
  insertId: patch.insertId ?? 1,
  affectedRows: patch.affectedRows ?? 1,
});

// 대부분의 라우트가 공통으로 거치는 쿼리들의 기본 응답.
// - 가계부 구성원 확인: 구성원(owner)
// - 고정비 자동 기록 확인: 만들 규칙 없음
export function useDefaultHandlers() {
  fakeDb.on(/FROM household_members WHERE household_id = \? AND user_id = \?/, [{ role: 'owner' }]);
  fakeDb.on(/SELECT \* FROM recurring_transactions/, []);
}
