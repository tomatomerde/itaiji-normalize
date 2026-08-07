import { readFirstUnit } from "./ivs.js";
import { requireString } from "./validate.js";

/**
 * Validates that `char` is exactly one base character optionally followed by
 * ONE variation selector, and returns the base character's code point as a
 * lowercase hex string (the key shape used by VARIANT_ADJACENCY).
 *
 * Shared by isVariant() and getVariants(), which both look relations up at
 * the base-character level (see docs/phase0-report.md #6): the variation
 * selector is accepted for input convenience but does not narrow the lookup.
 *
 * The selectorCount check is not cosmetic. Both functions used to say "a
 * single character optionally followed by one variation selector" in their
 * error message and then silently accept two or more, unlike reduce(), which
 * throws. A caller passing "辻" + VS17 + VS18 got an answer for plain 辻 with
 * no indication that the sequence it asked about was not the one that was
 * looked up.
 */
export function requireSingleUnitBase(char: string, fnName: string, argName: string): string {
  requireString(char, fnName, argName);
  const unit = readFirstUnit(char);
  if (!unit || unit.text.length !== char.length) {
    throw new TypeError(
      `${fnName}() expects ${argName} to be a single character optionally followed by one variation selector, got: ${JSON.stringify(char)}`,
    );
  }
  if (unit.selectorCount > 1) {
    throw new TypeError(
      `${fnName}() expects at most one variation selector in ${argName}, got ${unit.selectorCount} in: ${JSON.stringify(char)}`,
    );
  }
  return unit.base.codePointAt(0)!.toString(16);
}
