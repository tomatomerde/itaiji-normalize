import { VARIANT_ADJACENCY } from "./generated/tables.js";
import { readFirstUnit } from "./ivs.js";
import { requireString } from "./validate.js";

function requireSingleUnitBase(char: string, argName: string): string {
  requireString(char, "isVariant", argName);
  const unit = readFirstUnit(char);
  if (!unit || unit.text.length !== char.length) {
    throw new TypeError(
      `isVariant() expects a single character optionally followed by one variation selector for ${argName}, got: ${JSON.stringify(char)}`,
    );
  }
  // Variant relations are tracked at the base-character level (see
  // docs/phase0-report.md #6); the variation selector, if any, is accepted
  // for input convenience but does not narrow the lookup.
  return unit.base.codePointAt(0)!.toString(16);
}

/**
 * Direct-relation variant check: true if `a` and `b` are connected by a
 * single MJ Shrink Map edge (one reduces to the other, or both are
 * alternate JIS-representable forms of the same MJ source glyph).
 *
 * This is deliberately not the transitive closure over the whole variant
 * graph — some MJ entries chain through "dictionary" / "reading and shape
 * analogy" evidence and transitive closure would over-merge distinct
 * characters (see docs/phase0-report.md #6 for the largest connected
 * component sizes found during the phase 0 study).
 */
export function isVariant(a: string, b: string): boolean {
  const hexA = requireSingleUnitBase(a, "the first argument");
  const hexB = requireSingleUnitBase(b, "the second argument");
  if (hexA === hexB) return false;
  const neighbors = VARIANT_ADJACENCY[hexA];
  if (!neighbors) return false;
  return neighbors.some(([hex]) => hex === hexB);
}
