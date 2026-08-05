import type { Basis } from "./basis.js";

export type { Basis };

export interface Candidate {
  char: string;
  basis: Basis[];
}

export interface Variant extends Candidate {
  /**
   * True when no authority recorded this pair directly — the relation is
   * inferred from both characters appearing as candidates of the same MJ
   * glyph.
   *
   * This distinction matters because `basis` reads differently in the two
   * cases. On a direct edge it names what an authority said about these two
   * characters. On an inferred edge it names the evidence categories that
   * placed each of them under the shared MJ glyph — MOJ Notice 582 says 齍
   * may be written 斉 or 資, so 斉 and 資 are related through 齍, but the
   * notice never says the two are interchangeable. About 10% of the graph's
   * edges are inferred.
   */
  inferred: boolean;
}

/**
 * Which table entry actually produced `candidates`:
 * - "ivs" / "svs": the input's specific variation-sequence key was found
 * - "base": the input had no matching variation-sequence entry (or none of
 *   the right shape was present in the base character's data at all) and
 *   the plain base character's entry was used instead
 * - "none": no entry was found at all (candidates is empty)
 */
export type ResolvedVia = "ivs" | "svs" | "base" | "none";

export interface ReduceResult {
  input: string;
  candidates: Candidate[];
  /**
   * The representative character chosen by the built-in selection heuristic,
   * or null when there are zero candidates, or when multiple candidates are
   * tied under that heuristic and choosing one would be an arbitrary
   * (non-evidence-based) guess. See reduce.ts for the heuristic and its
   * documented limits.
   */
  unique: string | null;
  /** See ResolvedVia. Lets callers detect an IVS/SVS-to-base fallback. */
  resolvedVia: ResolvedVia;
}

/**
 * - "no-candidate": the character has no MJ Shrink Map entry at all
 * - "ambiguous": the character (or a character partway through its
 *   reduction chain) has multiple candidates tied under reduce()'s
 *   selection heuristic
 * - "cycle": the reduction chain revisited a character without ever
 *   reaching one that reduces to itself — every step was individually
 *   unambiguous, but the chain as a whole does not converge
 * - "unsupported-sequence": the base character carried more than one
 *   variation selector, so it was passed through untouched rather than
 *   reduced (reducing it would mean discarding selectors, or emitting a
 *   variation sequence that was never in the input)
 *
 * Note that only ideographs are reported at all — see MatchingKeyResult.
 */
export type UnresolvedReason = "no-candidate" | "ambiguous" | "cycle" | "unsupported-sequence";

export interface UnresolvedChar {
  /** The unit (base character, plus variation selector if any) that could not be resolved. */
  char: string;
  /** UTF-16 code unit offset of `char` within the (normalized) input string. */
  index: number;
  reason: UnresolvedReason;
}

export interface MatchingKeyResult {
  key: string;
  /**
   * Characters that were left unchanged in `key` because they could not be
   * reduced to a single stable representative.
   *
   * Only ideographs are listed. Kana, latin letters, digits, punctuation and
   * whitespace are outside the MJ character set by definition, so reporting
   * them would drown the real signal: on a routine address line, 33 of 34
   * characters would otherwise appear here, and the natural caller check
   * `if (result.unresolved.length) ...` would fire on essentially every
   * input. Non-ideographs still pass through into `key` unchanged.
   */
  unresolved: UnresolvedChar[];
}

export interface MatchingKeyOptions {
  /** Default: "NFKC". Pass false to disable Unicode normalization entirely. */
  unicodeNormalize?: "NFC" | "NFKC" | false;
}
