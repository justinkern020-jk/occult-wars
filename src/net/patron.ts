/** Patron codes — client side. Redeem is public; the owner's book goes through the Portal gate. */
import { watchCallOwner } from './watch';

export type MintedCode = { code: string; note: string; at: number; used: number; revoked: boolean };

/** Ask the table whether this is a real patron code. Resolves the canonical code, or an error line. */
export async function redeemPatronCode(code: string): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/patron', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'redeem', code }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
    if (res.ok && data.ok && typeof data.code === 'string') return { ok: true, code: data.code };
    return { ok: false, error: data.error || 'The table could not read that code.' };
  } catch {
    return { ok: false, error: 'The table is out of reach. Try again when you are online.' };
  }
}

export async function listPatronCodes(): Promise<MintedCode[] | null> {
  return (await watchCallOwner<{ codes: MintedCode[] }>({ op: 'patronList' }))?.codes ?? null;
}
export async function mintPatronCodes(n: number, note: string): Promise<{ minted: string[]; codes: MintedCode[] } | null> {
  return watchCallOwner<{ minted: string[]; codes: MintedCode[] }>({ op: 'patronMint', n, note });
}
export async function revokePatronCode(code: string): Promise<MintedCode[] | null> {
  return (await watchCallOwner<{ codes: MintedCode[] }>({ op: 'patronRevoke', code }))?.codes ?? null;
}
