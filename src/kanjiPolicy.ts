/**
 * Decoder for KANJI_POLICY (src/generated/tables.ts): per-character
 * 漢字施策 (常用漢字/人名用漢字) and JIS水準, used by reduce()'s pickBest to
 * break ties that its rank/hop tiers leave open — see src/reduce.ts.
 *
 * Packing (must stay in sync with scripts/build-tables.ts's packPolicy):
 * policy code in the high bits, 1-4 JIS水準 in the low 3 bits.
 */

/** 常用漢字 (the Jōyō kanji list). */
export const POLICY_JOYO = 1;
/** 人名用漢字 (kanji permitted in given names beyond the Jōyō list). */
export const POLICY_JINMEIYO = 2;

export interface KanjiPolicy {
  policy: typeof POLICY_JOYO | typeof POLICY_JINMEIYO;
  /** X0213 JIS水準: 1-4, lower is "more standard" (see build-tables.ts's jisLevelOf). */
  jisLevel: number;
}

export function decodeKanjiPolicy(packed: number): KanjiPolicy {
  return { policy: (packed >> 3) as KanjiPolicy["policy"], jisLevel: packed & 0b111 };
}
