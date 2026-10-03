import { describe, expect, it } from 'vitest';
import { mergeMeeting, type MeetingMessage } from './meeting';

const m = (id: number): MeetingMessage => ({ id, at: id, name: 'A', text: `t${id}`, badge: 'guest' });

describe('mergeMeeting', () => {
  it('adds newer messages in order and replaces on a full read', () => {
    expect(mergeMeeting([m(1), m(2)], { msgs: [m(4), m(3)], full: false }).map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(mergeMeeting([m(1), m(2)], { msgs: [m(2)], full: true }).map((x) => x.id)).toEqual([2]);
  });
});
