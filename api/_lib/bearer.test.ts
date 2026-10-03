import { afterEach, describe, expect, it } from 'vitest';
import { memoryStore, setStoreForTests } from './store.js';
import { handleAccount } from '../_routes/account.js';

describe('account bearer seat', () => {
  afterEach(() => {
    setStoreForTests(null);
    delete process.env.OW_ALLOW_MEMORY_ACCOUNTS;
  });

  it('returns a token that keeps the seat without a cookie; wrong password says so', async () => {
    setStoreForTests(memoryStore());
    process.env.OW_ALLOW_MEMORY_ACCOUNTS = '1';
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      handleAccount(new Request('https://x/api/account', { method: 'POST', body: JSON.stringify(body), headers }));
    const up = (await (await post({ op: 'signup', email: 'cy@example.com', password: 'hunter2hunter2' })).json()) as {
      token: string;
    };
    expect(up.token).toMatch(/^[0-9a-f]{64}$/);
    const me = await handleAccount(
      new Request('https://x/api/account', { headers: { authorization: `Bearer ${up.token}` } }),
    );
    expect(((await me.json()) as { seat: { email: string } }).seat.email).toBe('cy@example.com');

    const bad = await post({ op: 'signin', email: 'cy@example.com', password: 'not-the-one' });
    expect(bad.status).toBe(401);
    expect(((await bad.json()) as { error: string }).error).toBeTruthy();

    const inn = (await (await post({ op: 'signin', email: 'CY@example.com', password: 'hunter2hunter2' })).json()) as {
      token: string;
    };
    expect(inn.token).toMatch(/^[0-9a-f]{64}$/);
    expect(inn.token).not.toBe(up.token);

    await post({ op: 'signout' }, { authorization: `Bearer ${inn.token}` });
    const gone = await handleAccount(
      new Request('https://x/api/account', { headers: { authorization: `Bearer ${inn.token}` } }),
    );
    expect(((await gone.json()) as { seat: unknown }).seat).toBeNull();
  });

  it('closes an account with its password; the email can sign up again', async () => {
    setStoreForTests(memoryStore());
    process.env.OW_ALLOW_MEMORY_ACCOUNTS = '1';
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      handleAccount(new Request('https://x/api/account', { method: 'POST', body: JSON.stringify(body), headers }));
    const { token } = (await (await post({ op: 'signup', email: 'dee@example.com', password: 'hunter2hunter2' })).json()) as { token: string };
    const auth = { authorization: `Bearer ${token}` };
    await post({ op: 'name', username: 'Dee' }, auth);
    expect((await post({ op: 'delete', password: 'wrong-wrong' }, auth)).status).toBe(401);
    expect((await post({ op: 'delete', password: 'hunter2hunter2' }, auth)).status).toBe(200);
    const me = await handleAccount(new Request('https://x/api/account', { headers: auth }));
    expect(((await me.json()) as { seat: unknown }).seat).toBeNull();
    expect((await post({ op: 'signin', email: 'dee@example.com', password: 'hunter2hunter2' })).status).toBe(401);
    const again = await post({ op: 'signup', email: 'dee@example.com', password: 'hunter2hunter2' });
    expect(again.status).toBe(200);
    const t2 = ((await again.json()) as { token: string }).token;
    expect((await post({ op: 'name', username: 'Dee' }, { authorization: `Bearer ${t2}` })).status).toBe(200);
  });
});
