import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readSeatState,
  recordLine,
  refreshSeat,
  resetSeatForTests,
  signUp,
} from './account';

afterEach(() => {
  vi.unstubAllGlobals();
  resetSeatForTests();
});

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('account client', () => {
  it('formats a record line', () => {
    expect(recordLine(0, 0)).toBe('untried');
    expect(recordLine(7, 3)).toBe('7–3 · 70%');
  });

  it('marks the book shut when the server has no ledger store', async () => {
    vi.stubGlobal('fetch', answer(503, { ok: false, shut: true, error: 'shut' }));
    await refreshSeat();
    expect(readSeatState()).toEqual({ status: 'shut', seat: null });
  });

  it('takes a seat on sign-up', async () => {
    const seat = {
      id: 'u1',
      email: 'a@b.co',
      displayName: 'Ada',
      username: null,
      tableWins: 0,
      tableLosses: 0,
      practiceWins: 0,
      practiceLosses: 0,
    };
    const fetchMock = answer(200, { ok: true, seat });
    vi.stubGlobal('fetch', fetchMock);
    await signUp('a@b.co', 'password1', 'Ada');
    expect(readSeatState()).toEqual({ status: 'open', seat });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ op: 'signup', email: 'a@b.co' });
  });

  it('surfaces the server refusal', async () => {
    vi.stubGlobal('fetch', answer(409, { ok: false, error: 'That email already has a seat.' }));
    await expect(signUp('a@b.co', 'password1', '')).rejects.toThrow('That email already has a seat.');
  });
});
