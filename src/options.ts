import type { VariantOptions } from "./types.js";

/**
 * Validates the options object accepted by isVariant().
 *
 * Mirrors the guard toMatchingKey() applies to its own options: an unchecked
 * options bag is how `toMatchingKey("崎", "NFC")` used to fall back to the
 * default without complaining. Here the same slip — passing a string, or
 * misspelling the flag — would silently give the caller the default
 * (inferred edges included) while they believed they had opted out, which is
 * the direction that answers true for 井/牛.
 */
export function resolveVariantOptions(options: VariantOptions, fnName: string): { includeInferred: boolean } {
  if (options === null || typeof options !== "object") {
    throw new TypeError(
      `${fnName}() expects its options argument to be an object, received ${
        options === null ? "null" : `a ${typeof options}`
      }`,
    );
  }
  for (const key of Object.keys(options)) {
    if (key !== "includeInferred") {
      throw new TypeError(`${fnName}() received an unknown option ${JSON.stringify(key)}`);
    }
  }
  const value = options.includeInferred;
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`${fnName}() expects options.includeInferred to be a boolean, received a ${typeof value}`);
  }
  return { includeInferred: value !== false };
}
