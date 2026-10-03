import { describe, expect, it } from 'vitest';
import { portalCodeFor } from './portalCodes';

describe('portalCodeFor', () => {
  it('reads the in-match codes the portal can carry', () => {
    expect(portalCodeFor('seth kern')).toBe('seth');
    expect(portalCodeFor('911911')).toBe('adept');
    expect(portalCodeFor('nothing here')).toBeNull();
    expect(portalCodeFor('')).toBeNull();
  });
});
