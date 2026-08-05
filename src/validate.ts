/**
 * Guards the public entry points against non-string input.
 *
 * TypeScript callers get this from the type signatures, but the package is
 * also consumed from plain JavaScript, and the failure mode there was bad:
 * `reduce(["崎"])` did not throw, it echoed the array back as `input` and
 * returned a real-looking candidate, so a caller who passed a whole column
 * of values instead of one value got plausible wrong output with nothing to
 * notice. Meanwhile `reduce(null)` failed with "Cannot read properties of
 * null (reading 'length')", which says nothing about which argument of which
 * function was wrong.
 */
export function requireString(value: unknown, fnName: string, argName: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${fnName}() expects ${argName} to be a string, received ${describeType(value)}`);
  }
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "an array";
  const type = typeof value;
  return `${type === "object" ? "an" : "a"} ${type}`;
}
