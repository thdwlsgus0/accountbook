import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 실제 서버 대신 요청 횟수만 세는 가짜 api를 쓴다.
const get = vi.fn();
vi.mock('../api/client', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

const { prefetch, getOnce } = await import('./prefetch');

describe('prefetch / getOnce', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((url: string) => Promise.resolve({ data: { url, at: get.mock.calls.length } }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('미리 요청해 둔 결과를 첫 번째 getOnce가 그대로 쓴다 (요청 1번)', async () => {
    prefetch('/a');
    const data = await getOnce<{ url: string }>('/a');
    expect(data.url).toBe('/a');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('미리 받은 결과는 한 번만 쓰고, 그다음부턴 새로 요청한다', async () => {
    prefetch('/b');
    await getOnce('/b');
    await getOnce('/b');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('같은 주소를 여러 번 prefetch해도 요청은 한 번', () => {
    prefetch('/c');
    prefetch('/c');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('10초가 지난 미리 받기 결과는 쓰지 않고 새로 요청한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    prefetch('/d');
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 11));
    await getOnce('/d');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('미리 받기가 실패해도 그 에러는 getOnce에서 받는다', async () => {
    get.mockImplementationOnce(() => Promise.reject(new Error('network')));
    prefetch('/e');
    await expect(getOnce('/e')).rejects.toThrow('network');
  });
});
