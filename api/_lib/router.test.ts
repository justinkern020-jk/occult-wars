import { describe, expect, it } from 'vitest';
import { route, routeName } from '../[fn].js';

describe('api router', () => {
  it('names the door from the path or the fn query', () => {
    expect(routeName(new Request('https://x/api/table'))).toBe('table');
    expect(routeName(new Request('https://x/api/meeting/'))).toBe('meeting');
    expect(routeName(new Request('https://x/api/[fn]?fn=watch'))).toBe('watch');
    expect(routeName(new Request('https://x/api/account?op=book'))).toBe('account');
  });
  it('unknown doors are a bare 404; known ones answer', async () => {
    expect((await route(new Request('https://x/api/nope'))).status).toBe(404);
    expect((await route(new Request('https://x/api/table'))).status).toBe(405);
  });
});
