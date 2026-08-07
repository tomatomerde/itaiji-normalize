import { VARIANT_ADJACENCY } from "./generated/tables.js";
import { requireSingleUnitBase } from "./unit.js";
import { resolveVariantOptions } from "./options.js";
import type { VariantOptions } from "./types.js";

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
 *
 * About a tenth of the graph's edges are inferred rather than recorded: both
 * characters are candidates of one shared MJ glyph, which relates them only
 * through that third character (see Variant.inferred). They are included by
 * default, because MJ registers a shrink relation only for a glyph that
 * needs shrinking — so between two characters that are both already in JIS X
 * 0213, co-candidacy is the only link the data has, and dropping it answers
 * false for pairs like 猫/貓 and 摂/攝. Pass `{ includeInferred: false }` for
 * the stricter reading; that is the setting under which isVariant("井", "牛")
 * is false.
 *
 * getVariants() reports the same distinction per neighbour instead of
 * filtering it out, because it can hand the flag back. A boolean cannot,
 * which is why this function takes an option and that one does not.
 *
 * Returns false when `a` and `b` are the same base character: this answers
 * "are these two different characters variants of each other", so an identity
 * check is the caller's to make (`a === b || isVariant(a, b)`).
 */
export function isVariant(a: string, b: string, options: VariantOptions = {}): boolean {
  const hexA = requireSingleUnitBase(a, "isVariant", "the first argument");
  const hexB = requireSingleUnitBase(b, "isVariant", "the second argument");
  const { includeInferred } = resolveVariantOptions(options, "isVariant");
  if (hexA === hexB) return false;
  const neighbors = VARIANT_ADJACENCY[hexA];
  if (!neighbors) return false;
  return neighbors.some(([hex, , direct]) => hex === hexB && (includeInferred || direct === 1));
}
