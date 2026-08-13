import { KANJI_POLICY, REDUCE_BY_IVS, REDUCE_BY_UCS, type SerializedCandidate } from "./generated/tables.js";
import { basisMaskToList } from "./basis.js";
import { decodeKanjiPolicy, POLICY_JINMEIYO, POLICY_JOYO } from "./kanjiPolicy.js";
import { ivsKey, readFirstUnit, variationSelectorKind } from "./ivs.js";
import { requireString } from "./validate.js";
import type { Candidate, ReduceResult, ResolvedVia } from "./types.js";

// Bit positions must match BASIS_ORDER in basis.ts.
const BIT_MOJ_NOTICE = 1 << 1; // 法務省告示582号別表第四 (carries an explicit priority rank)
const BIT_FAMILY_REGISTER = 1 << 3; // 法務省戸籍法関連通達・通知 (carries a hop count)

function toCandidates(list: SerializedCandidate[]): Candidate[] {
  return list.map(([hex, bitmask]) => ({
    char: String.fromCodePoint(Number.parseInt(hex, 16)),
    basis: basisMaskToList(bitmask),
  }));
}

/**
 * Picks a single representative candidate, or null if none exists or the
 * choice would be arbitrary.
 *
 * Heuristic (documented, not a literal port of any external tool, except
 * where noted below): prefer the candidate with the best (lowest) 法務省告示
 * 582号別表第四 priority rank, since that notice's rank field exists
 * specifically to pick a representative form; failing that, prefer the
 * lowest 法務省戸籍法関連通達 hop count, since a smaller hop count means a
 * more direct chain of custody in that record; failing that, prefer a
 * candidate that is 常用漢字 (the Jōyō kanji list) if exactly one of the tied
 * candidates is, or a candidate that is 人名用漢字 (broken by lowest JIS水準)
 * if exactly one of those is — this last tier is the one rule IPA's own
 * reference implementation (mandel59/mj2jisx0213) applies, so it is used
 * verbatim rather than invented; failing all of that (including when 2+ tied
 * candidates share the same 常用漢字/人名用漢字 status), there is no ranked
 * evidence left to break the tie, and this function returns null rather than
 * picking arbitrarily (e.g. by code point). See breakPolicyTie for this last
 * tier's exact rules.
 *
 * MJ prescribes no selection procedure — its guidance is that a caller
 * should judge the real target from the context the character appears in,
 * and it offers "prefer the 常用漢字" / "prefer the lowest JIS code" only as
 * examples. So the tier order below is this package's reading, and it is not
 * uniformly right: measured over the shipped tables, rank and hop pick
 * different winners for 248 source characters, and rank does not always pick
 * the more common form (e.g. 㓮, where rank gives the rare 雕 and hop gives
 * the everyday 彫).
 *
 * Two properties that follow from the rank/hop tiers and are easy to misread:
 *
 *   - Rank never ties: across all 40,295 table keys there is no key where two
 *     candidates share the best 順位, so tier 0 always decides on its own.
 *     Every recorded tie is at the hop tier (234) or the unranked tier (572)
 *     before the 常用漢字/人名用漢字 tier gets a chance to break it.
 *   - JIS包摂規準 evidence carries no rank and no hop, so it lands in the last
 *     rank/hop tier and never wins there. That category usually names the
 *     source character itself — MJ's way of recording "already
 *     representable" — which is why reduce("㐂").unique is 喜 rather than 㐂
 *     (1,288 keys behave that way, and 5 more keys carrying a self-candidate
 *     end in a tie that not even the 常用漢字/人名用漢字 tier resolves, and
 *     return null).
 *
 * These figures are pinned by test/data-invariants.test.ts ("文書が主張する
 * 統計値") — update them together with a data update, not from memory.
 */
export interface Selection {
  /** The winning candidate, or null when nothing wins outright. */
  unique: string | null;
  /**
   * When `unique` is null because two or more candidates scored identically,
   * those candidates. Empty otherwise. toMatchingKey uses this to check
   * whether the tie actually matters — see resolveTie there.
   */
  tied: string[];
}

/**
 * Breaks a tie pickBest's rank/hop tiers left unresolved, using 漢字施策
 * (常用漢字/人名用漢字) — the same tie-break IPA's own reference
 * implementation (mandel59/mj2jisx0213) applies once its own rank/hop-style
 * tiers run out. Only ever called with 2+ candidates that already scored
 * identically on tier and secondary key; returns the winning candidate's hex,
 * or null if this rule doesn't resolve it either (never a guess: matches the
 * reference implementation's own refusal to pick between two 常用漢字, or
 * between two 人名用漢字 tied at the same JIS水準).
 *
 * 1. Exactly one tied candidate is 常用漢字 -> it wins.
 * 2. Two or more are 常用漢字 -> unresolved. The reference implementation
 *    stops here too rather than inventing a further rule; doing otherwise
 *    here would be exactly the evidence-free pick this package refuses.
 * 3. No 常用漢字, but exactly one 人名用漢字 -> it wins.
 * 4. Two or more 人名用漢字 -> the lowest JIS水準 among them wins, unless
 *    more than one shares that水準, in which case unresolved.
 * 5. Neither category present among the tied candidates -> unresolved.
 */
function breakPolicyTie(tiedHexes: readonly string[]): string | null {
  const joyo: string[] = [];
  const jinmeiyo: Array<{ hex: string; jisLevel: number }> = [];
  for (const candidateHex of tiedHexes) {
    const packed = KANJI_POLICY[candidateHex];
    if (packed === undefined) continue;
    const { policy, jisLevel } = decodeKanjiPolicy(packed);
    if (policy === POLICY_JOYO) joyo.push(candidateHex);
    else if (policy === POLICY_JINMEIYO) jinmeiyo.push({ hex: candidateHex, jisLevel });
  }
  if (joyo.length === 1) return joyo[0]!;
  if (joyo.length >= 2) return null;
  if (jinmeiyo.length === 1) return jinmeiyo[0]!.hex;
  if (jinmeiyo.length >= 2) {
    const minLevel = Math.min(...jinmeiyo.map((j) => j.jisLevel));
    const atMinLevel = jinmeiyo.filter((j) => j.jisLevel === minLevel);
    return atMinLevel.length === 1 ? atMinLevel[0]!.hex : null;
  }
  return null;
}

function pickBest(list: SerializedCandidate[]): Selection {
  if (list.length === 0) return { unique: null, tied: [] };
  if (list.length === 1) return { unique: String.fromCodePoint(Number.parseInt(list[0]![0], 16)), tied: [] };

  const scored = list.map((candidate) => {
    const [, bitmask, rank, hop] = candidate;
    let tier: number;
    let secondary: number;
    if (bitmask & BIT_MOJ_NOTICE && rank !== null) {
      tier = 0;
      secondary = rank;
    } else if (bitmask & BIT_FAMILY_REGISTER && hop !== null) {
      tier = 1;
      secondary = hop;
    } else {
      tier = 2;
      secondary = 0;
    }
    return { candidate, tier, secondary };
  });
  scored.sort((a, b) => a.tier - b.tier || a.secondary - b.secondary);

  const best = scored[0]!;
  const tiedWithBest = scored.filter((s) => s.tier === best.tier && s.secondary === best.secondary);
  if (tiedWithBest.length > 1) {
    const policyWinnerHex = breakPolicyTie(tiedWithBest.map((s) => s.candidate[0]));
    if (policyWinnerHex !== null) {
      return { unique: String.fromCodePoint(Number.parseInt(policyWinnerHex, 16)), tied: [] };
    }
    return {
      unique: null,
      tied: tiedWithBest.map((s) => String.fromCodePoint(Number.parseInt(s.candidate[0], 16))),
    };
  }
  return { unique: String.fromCodePoint(Number.parseInt(best.candidate[0], 16)), tied: [] };
}

function pickUnique(list: SerializedCandidate[]): string | null {
  return pickBest(list).unique;
}

/**
 * Reduces one character (optionally followed by a single variation
 * selector) to its JIS X 0213-representable candidate(s), with evidence.
 *
 * Throws if `char` is not exactly one such unit — use splitUnits() from
 * ivs.ts (re-exported nowhere on purpose; callers processing whole strings
 * should use toMatchingKey instead) to iterate a longer string first.
 */
export function reduce(char: string): ReduceResult {
  requireString(char, "reduce", "its argument");
  const unit = readFirstUnit(char);
  if (!unit || unit.text.length !== char.length) {
    throw new TypeError(
      `reduce() expects a single character optionally followed by one variation selector, got: ${JSON.stringify(char)}`,
    );
  }
  if (unit.selectorCount > 1) {
    // Reducing only the first selector would silently discard the rest and
    // could emit a variation sequence the caller never supplied; use
    // toMatchingKey, which passes such sequences through untouched.
    throw new TypeError(
      `reduce() expects at most one variation selector, got ${unit.selectorCount} in: ${JSON.stringify(char)}`,
    );
  }

  let list: SerializedCandidate[] | undefined;
  let resolvedVia: ResolvedVia = "none";
  const vsKind = unit.vs ? variationSelectorKind(unit.vs.codePointAt(0)!) : null;
  if (unit.vs && vsKind) {
    list = REDUCE_BY_IVS[ivsKey(unit.base, unit.vs)];
    if (list) resolvedVia = vsKind;
  }
  if (!list) {
    list = REDUCE_BY_UCS[unit.base.codePointAt(0)!.toString(16)];
    if (list) resolvedVia = "base";
  }
  if (!list) {
    return { input: char, candidates: [], unique: null, resolvedVia: "none" };
  }

  return { input: char, candidates: toCandidates(list), unique: pickUnique(list), resolvedVia };
}

/**
 * The same table lookup and representative selection reduce() performs, minus
 * the Candidate[] materialization.
 *
 * Not exported from the package entry point — this exists for
 * toMatchingKey(), which walks a reduction chain of up to four hops per
 * character and throws away the candidate list at every one of them.
 * Building it there cost one array for the candidates plus one basis array
 * per candidate, per hop, per character of input.
 *
 * `baseCp`/`vsCp` are code points rather than strings so the caller's inner
 * loop does not have to allocate a string per hop either.
 *
 * @internal
 */
export function selectRepresentative(
  baseCp: number,
  vsCp: number | null,
): Selection & { hasCandidates: boolean } {
  let list: SerializedCandidate[] | undefined;
  if (vsCp !== null) {
    list = REDUCE_BY_IVS[`${baseCp.toString(16)}_${vsCp.toString(16)}`];
  }
  if (!list) {
    list = REDUCE_BY_UCS[baseCp.toString(16)];
  }
  if (!list) return { unique: null, tied: [], hasCandidates: false };
  return { ...pickBest(list), hasCandidates: true };
}
