import { describe, expect, it } from 'vitest';
import { FULCANELLI_WARNING, JUSTIN_EPILOGUE } from './campaign';

describe('FULCANELLI_WARNING', () => {
  it('exports the Paris 1937 warning with nuclear + Great Work core', () => {
    expect(FULCANELLI_WARNING.title).toBeTruthy();
    expect(FULCANELLI_WARNING.attribution).toContain('Fulcanelli');
    expect(FULCANELLI_WARNING.attribution).toContain('Jacques Bergier');
    expect(FULCANELLI_WARNING.attribution).toContain('June 1937');
    expect(FULCANELLI_WARNING.quote.startsWith("You're on the brink of success")).toBe(
      true,
    );
    expect(FULCANELLI_WARNING.quote).toContain('liberation of nuclear power');
    expect(FULCANELLI_WARNING.quote).toContain("what we call the Great Work.");
    expect(FULCANELLI_WARNING.quote).toContain("'a field of force'");
    expect(FULCANELLI_WARNING.quote).not.toContain("call ' a field");
    expect(FULCANELLI_WARNING.footnote).toBeTruthy();
  });

  it('sits after the Justin epilogue in the campaign curtain', () => {
    expect(JUSTIN_EPILOGUE.title).toContain('Justin');
    expect(FULCANELLI_WARNING.title.length).toBeGreaterThan(0);
  });
});
