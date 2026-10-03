/** The end-of-match fortune: which shard table a match mode pays from. */
import { SHARD_REWARDS, type ShardRewards } from './profile';

export type FortuneMode = 'training' | 'hotseat' | 'campaign' | 'friend' | 'second' | 'old';

/** Same mapping as App's onMatchEnd: Second Hour practice pays as training, a friend table as pvp. */
export function shardTableFor(mode: FortuneMode): keyof ShardRewards {
  if (mode === 'friend') return 'pvp';
  if (mode === 'second') return 'training';
  return mode;
}

export function shardGainFor(mode: FortuneMode, won: boolean): number {
  const t = SHARD_REWARDS[shardTableFor(mode)];
  return Math.max(0, won ? t.win : t.loss);
}
