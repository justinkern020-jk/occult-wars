import { describe, expect, it } from 'vitest';
import { mergeMeeting, type MeetingMessage } from './meeting';

const m = (id: number): MeetingMessage => ({ id, at: id, name: 'A', text: `t${id}`, badge: 'guest' });

describe('mergeMeeting', () => {
  it('adds newer messages in order and replaces on a full read', () => {
    expect(mergeMeeting([m(1), m(2)], { msgs: [m(4), m(3)], full: false }).map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(mergeMeeting([m(1), m(2)], { msgs: [m(2)], full: true }).map((x) => x.id)).toEqual([2]);
  });
});

import { safeImageSrc } from './meeting';
import { fitWithin } from './meetingImage';

describe('meeting images (client)', () => {
  it('only shows images the meeting serves', () => {
    expect(safeImageSrc('/api/meeting?img=12')).toBe('/api/meeting?img=12');
    expect(safeImageSrc('https://abc123.public.blob.vercel-storage.com/meeting/12-xyz.webp')).toBeTruthy();
    expect(safeImageSrc('https://evil.example/x.png')).toBeNull();
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
  });
  it('fits the long side within 1024 and never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ w: 1024, h: 768 });
    expect(fitWithin(600, 2000)).toEqual({ w: 307, h: 1024 });
    expect(fitWithin(300, 200)).toEqual({ w: 300, h: 200 });
  });
});

import { linkParts } from './meeting';

describe('linkParts', () => {
  it('turns http(s) links into links and leaves the rest as text', () => {
    expect(linkParts('see https://example.com/a?b=1, then talk')).toEqual([
      { text: 'see ' },
      { href: 'https://example.com/a?b=1', text: 'https://example.com/a?b=1' },
      { text: ', then talk' },
    ]);
    expect(linkParts('javascript:alert(1) <b>hi</b>')).toEqual([{ text: 'javascript:alert(1) <b>hi</b>' }]);
    expect(linkParts('(http://x.io).')).toEqual([{ text: '(' }, { href: 'http://x.io/', text: 'http://x.io' }, { text: ').' }]);
  });
});
