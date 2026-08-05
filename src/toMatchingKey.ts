import { isCjkIdeograph } from "./cjk.js";
import { splitUnits, type ParsedUnit } from "./ivs.js";
import { selectRepresentative } from "./reduce.js";
import { requireString } from "./validate.js";
import type { MatchingKeyOptions, MatchingKeyResult, UnresolvedChar, UnresolvedReason } from "./types.js";

// Empirically measured by sweeping every key in the shipped table through
// reduce() (both REDUCE_BY_UCS and REDUCE_BY_IVS): the deepest chain
// observed is 4 hops before reaching a character that reduces to itself
// (an IVS-keyed entry, U+9229 with variation selector U+E0102). This bound
// is a generous safety margin, not a tuned limit — if a future data update
// produced a much longer chain we'd rather report it as unresolved (see the
// cycle branch below) than loop unbounded.
const MAX_HOPS = 20;

interface ChainResult {
  /** The stable representative (reduce(final).unique === final), or null if none was reached. */
  final: string | null;
  reason: UnresolvedReason | null;
}

type NormalizeMode = "NFC" | "NFKC" | false;

const VALID_NORMALIZE_MODES = new Set<unknown>(["NFC", "NFKC", false]);

/**
 * Validates `options.unicodeNormalize` instead of handing it straight to
 * String.prototype.normalize.
 *
 * "NFD" and "NFKD" are real normalization forms, so normalize() accepts them
 * happily — but a key built with a decomposing form can never equal one built
 * with the default, which is exactly the silent, plausible-looking wrong
 * answer the string guards elsewhere exist to prevent. Anything else reached
 * normalize() and threw a bare RangeError naming no function or argument, and
 * passing a non-object as `options` (e.g. toMatchingKey("崎", "NFC")) was
 * ignored entirely and silently fell back to NFKC.
 */
function resolveNormalizeMode(options: MatchingKeyOptions): NormalizeMode {
  if (options === null || typeof options !== "object") {
    throw new TypeError(
      `toMatchingKey() expects its second argument to be an options object, received ${
        options === null ? "null" : `a ${typeof options}`
      }`,
    );
  }
  const mode = options.unicodeNormalize;
  if (mode === undefined) return "NFKC";
  if (!VALID_NORMALIZE_MODES.has(mode)) {
    throw new TypeError(
      `toMatchingKey() expects options.unicodeNormalize to be "NFC", "NFKC" or false, received ${JSON.stringify(mode)}`,
    );
  }
  return mode;
}

function normalizeIfEnabled(text: string, mode: NormalizeMode): string {
  return mode === false ? text : text.normalize(mode);
}

/**
 * A single reduce() call only performs one hop of the MJ Shrink Map's
 * many-to-one relation, and most characters need more than one hop to
 * reach a character that reduces to itself — see docs/phase0-report.md's
 * addendum on this: of the ~30k characters with shrink candidates, most
 * take 2+ hops, not 1, to stabilize. Without iterating, two spellings of
 * the same name can land on two different (non-final) intermediate forms
 * and never actually match, defeating the entire purpose of this function.
 *
 * MJ's own reduction targets occasionally land on a CJK Compatibility
 * Ideograph that is itself a stable reduce() fixed point but is NOT the
 * same code point NFKC/NFC would fold it to (e.g. 㙇 U+3647 reduces to
 * U+FA4A, a compatibility ideograph, while plain 琢 U+7422 is already
 * stable at U+7422 — the two are NFKC-equivalent but reduce() alone never
 * unifies them). So every hop's result is re-normalized with the same
 * `mode` the caller chose before continuing the walk or comparing for a
 * fixed point/cycle — not just the initial input — or that class of
 * mismatch survives silently. When `mode` is false (the caller explicitly
 * asked to see MJ's contribution in isolation), no normalization is
 * applied at any hop, and this class of mismatch is an accepted,
 * documented consequence of that choice.
 *
 * Refuses to guess (reporting "ambiguous" or "cycle" instead) if the chain
 * hits an ambiguous character partway or revisits a character without ever
 * stabilizing.
 */
function reduceToFixedPoint(base: string, vs: string | null, mode: NormalizeMode): ChainResult {
  const unitText = vs === null ? base : base + vs;
  const first = selectRepresentative(base.codePointAt(0)!, vs === null ? null : vs.codePointAt(0)!);
  if (first.unique === null) {
    return { final: null, reason: first.hasCandidates ? "ambiguous" : "no-candidate" };
  }
  const normalizedFirst = normalizeIfEnabled(first.unique, mode);
  if (normalizedFirst === unitText) {
    return { final: normalizedFirst, reason: null };
  }

  const visited = new Set<string>([unitText, normalizedFirst]);
  let current = normalizedFirst;
  for (let hops = 1; hops < MAX_HOPS; hops++) {
    // Every reduction target is a single code point with no variation
    // selector — pinned by a data-invariant test, since a target that
    // expanded under normalization would break this assumption.
    const result = selectRepresentative(current.codePointAt(0)!, null);
    if (result.unique === null) {
      // The starting character did have candidates (we got this far); an
      // intermediate step is what's ambiguous, so this is "ambiguous", not
      // "no-candidate" (which means the start itself had nothing).
      return { final: null, reason: "ambiguous" };
    }
    const next = normalizeIfEnabled(result.unique, mode);
    if (next === current) {
      return { final: current, reason: null };
    }
    if (visited.has(next)) {
      // Revisiting a character means this chain cycles instead of settling
      // on a fixed point — there is no single stable representative to pick.
      // Distinguished from "ambiguous" (a tie between candidates) because
      // the underlying failure mode is different: every step here was
      // itself unambiguous, the chain simply never settles.
      return { final: null, reason: "cycle" };
    }
    visited.add(next);
    current = next;
  }
  return { final: null, reason: "cycle" };
}

/**
 * Builds a name-matching key from `text` by reducing each character to its
 * stable MJ Shrink Map representative where possible (see
 * reduceToFixedPoint above for why one reduce() call is not enough).
 *
 * Default normalization is NFKC: per docs/phase0-report.md #5, 460 of the
 * 474 CJK Compatibility Ideographs decompose under NFKC/NFC, so applying it
 * first folds those (and half-width/full-width variance) before the MJ
 * lookup runs, and is also applied to every intermediate reduction result
 * for the same reason (see reduceToFixedPoint). The remaining
 * Unicode-stable variants (e.g. 髙, 邊, 濵) are exactly what the MJ table
 * handles instead. Pass `unicodeNormalize: false` to see MJ's contribution
 * in isolation, or `"NFC"` to keep compatibility ideographs distinct.
 *
 * A character (or character + variation selector unit) that has no MJ
 * candidates, is ambiguous, or whose reduction chain cycles instead of
 * stabilizing, is passed through unchanged (including its variation
 * selector, if any) in `key` and reported in `unresolved` with a `reason`
 * — this function never silently guesses. Only ideographs are reported;
 * see MatchingKeyResult.unresolved for why.
 */
export function toMatchingKey(text: string, options: MatchingKeyOptions = {}): MatchingKeyResult {
  requireString(text, "toMatchingKey", "its first argument");
  const mode = resolveNormalizeMode(options);
  const normalized = normalizeIfEnabled(text, mode);

  const units = splitUnits(normalized);
  const unresolved: UnresolvedChar[] = [];
  let key = "";
  let index = 0;
  for (const unit of units) {
    const { final, reason } = resolveUnit(unit, mode);
    if (final !== null) {
      key += final;
    } else {
      key += unit.text;
      // Reporting non-ideographs here would bury the real signal — see
      // MatchingKeyResult.unresolved. They still pass through into `key`.
      if (isCjkIdeograph(unit.base.codePointAt(0)!)) {
        unresolved.push({ char: unit.text, index, reason: reason! });
      }
    }
    index += unit.text.length;
  }
  return { key, unresolved };
}

function resolveUnit(unit: ParsedUnit, mode: NormalizeMode): ChainResult {
  if (unit.selectorCount > 1) {
    // reduce() rejects these outright. Passing the unit through verbatim is
    // the only option that keeps the output idempotent: reducing the base
    // and re-emitting the leftover selectors would synthesize a variation
    // sequence the caller never wrote.
    return { final: null, reason: "unsupported-sequence" };
  }
  return reduceToFixedPoint(unit.base, unit.vs, mode);
}
