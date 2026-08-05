# Changelog

Notable changes to this package. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — unreleased

First release. Not yet published to npm; `npm publish` is a manual step.

### Added

- `reduce(char)` — shrink one character (optionally with one variation
  selector) to its JIS X 0213-representable candidates, each carrying the
  category of evidence recorded for it in the MJ Shrink Map. Reports the
  representative pick as `unique`, or `null` when the candidates are tied
  under a documented heuristic rather than guessing between them, and
  reports which table entry answered via `resolvedVia`.
- `isVariant(a, b)` — whether two characters are directly related in the MJ
  variant graph. Deliberately not the transitive closure, which would
  over-merge characters linked only through weakly-evidenced categories.
- `getVariants(char)` — enumerate directly related characters with evidence,
  for query expansion. Order carries no meaning.
- `toMatchingKey(text, options?)` — build a name-matching key, iterating the
  reduction to a fixed point (most characters need more than one step) and
  reporting anything it could not resolve rather than guessing.
- IVS and SVS input accepted as a single unit, with fallback to the base
  character.
- Dual ESM/CJS build with per-condition type declarations; `arethetypeswrong`
  reports no problems.
- Bundled data snapshots with provenance (source, version, retrieval date,
  SHA-256). Nothing is fetched over the network at build or run time.

### Behavior worth calling out

- Standard Variation Selectors are accepted only in U+FE00–U+FE0D. U+FE0E and
  U+FE0F are Unicode's presentation selectors, and treating U+FE0F as a
  variation selector meant silently deleting it from ordinary text containing
  emoji. A consequence: a base character followed by U+FE0F is two characters,
  not one unit, so `reduce`, `isVariant` and `getVariants` throw on it rather
  than quietly ignoring the selector. `toMatchingKey` handles such strings
  normally.
- `options.unicodeNormalize` is validated. `"NFD"` and `"NFKD"` are rejected
  even though `String.prototype.normalize` accepts them: a key built with a
  decomposing form can never equal one built with the default, which is the
  kind of silent mismatch this library exists to avoid.

### Notes for early adopters

- The whole API costs about 552 KB gzipped because the tables are large.
  Importing a subset costs less (~270–281 KB) thanks to `/* @__PURE__ */`
  annotations that let bundlers drop unreached tables. A compact re-encoding
  is designed but not implemented — see the roadmap in the README.
- `unresolved` lists ideographs only. Kana, latin, digits and punctuation
  pass through into the key without being reported, so that the field
  carries signal.
- The default `unicodeNormalize: "NFKC"` also folds compatibility forms
  (`㈱`→`(株)`, `①②③`→`123`), which can make the key longer than the input.
- Node 18, 20 and 22 are exercised in CI, Node 18 by installing the packed
  tarball and calling it through both `require()` and `import()`. Browser and
  Cloudflare Workers execution is a supported target but is not yet covered
  by CI.
