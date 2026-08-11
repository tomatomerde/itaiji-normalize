# Changelog

Notable changes to this package. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.1 — 2026-08-11

### Added

- `scripts/assert-npm-version.sh`, called twice in `release.yml`: after the
  global npm upgrade, and again immediately before publishing. The second
  call is the point of it — the Node 18 smoke test re-runs
  `actions/setup-node`, which can put the Node-bundled npm (10.9.x, below
  trusted publishing's 11.5.1 floor) back on PATH, and the failure that
  causes is an authentication error at `npm publish` that names no version.

### Changed

- README (both languages): the two conditions that fail *after* installing —
  the ~270–290 KB gzipped floor per entry point (~560 KB for the whole API)
  and the full-ICU requirement for the default NFKC normalization — now sit
  directly under the install command instead of ~300 lines further down,
  and "Known limitations" comes before the API reference rather than after
  it. Added npm-version, runtime and module-format badges. The CI-coverage
  detail that opened the README moved into "Support and scope", so the
  problem statement is what a reader meets first.
- The `EOTP` diagnostic in `scripts/npm-publish.sh` said the fix was to
  recreate `NPM_TOKEN`, without noting that reaching that error at all means
  the run authenticated with a token rather than through OIDC — the trusted
  publishing path never asks for a one-time password.

## 0.1.0 — 2026-08-10

First release.

### Added

- `reduce(char)` — shrink one character (optionally with one variation
  selector) to its JIS X 0213-representable candidates, each carrying the
  category of evidence recorded for it in the MJ Shrink Map. Reports the
  representative pick as `unique`, or `null` when the candidates are tied
  under a documented heuristic rather than guessing between them, and
  reports which table entry answered via `resolvedVia`.
- `isVariant(a, b, options?)` — whether two characters are directly related
  in the MJ variant graph. Deliberately not the transitive closure, which
  would over-merge characters linked only through weakly-evidenced
  categories. `{ includeInferred: false }` restricts the answer to relations
  an authority recorded, which is what makes isVariant("井", "牛") false;
  it defaults to true because the strict setting also drops real pairs
  (see below).
- `getVariants(char)` — enumerate directly related characters with evidence,
  for query expansion. Order carries no meaning. Each result carries
  `inferred`, distinguishing edges an authority recorded from the ~10% that
  are inferred from two characters sharing one MJ glyph — on those, `basis`
  describes the shared relationship, not a statement about the pair.
- `toMatchingKey(text, options?)` — build a name-matching key, iterating the
  reduction to a fixed point (most characters need more than one step) and
  reporting anything it could not resolve rather than guessing. When
  candidates tie, it follows every tied branch and accepts the result only if
  they all reach the same fixed point — a proof that the choice could not
  have mattered, not a guess. That is why 渡邉, 渡邊 and 渡辺 all produce the
  same key.
- IVS and SVS input accepted as a single unit, with fallback to the base
  character.
- Dual ESM/CJS build with per-condition type declarations; `arethetypeswrong`
  reports no problems.
- Bundled data snapshots with provenance (source, version, retrieval date,
  SHA-256). Nothing is fetched over the network at build or run time.

### Fixed

- Characters the 民一2842号通達別表 誤字俗字・正字一覧表 annotates 付記=別字
  ("a different character") were being folded onto exactly the character the
  notice distinguishes them from: 96 of the 113 reachable cases, including
  㐲→伏, 㕍→雁, 㬌→景 and 䇦→英. IPA's own reference program drops such a
  target from every category of the entry; the table builder now does the
  same, removing 314 candidates. One case survives (腈→晴) because it is
  reached through a two-hop chain rather than directly, and the reference
  program does single-step conversion only.

### Behavior worth calling out

- Inferred edges are included by default, and the option to exclude them
  costs more than it looks. MJ registers a shrink relation only for a glyph
  that needs shrinking, so two characters that are both already in JIS X
  0213 have no recorded edge and co-candidacy is the only link the data has:
  `{ includeInferred: false }` therefore answers false for 猫/貓, 摂/攝,
  併/倂, 靱/靭 and 桝/枡, and leaves 34 characters with no variants at all.
  The README says so next to the option.
- `toMatchingKey` returns the normalized input alongside the key, because
  `unresolved[].index` indexes that rather than the caller's own string, and
  normalization can push the offset past the end of it (NFKC turns ㍿ into
  four characters).
- `isVariant` and `getVariants` reject two or more variation selectors on one
  base character, matching `reduce`. They previously accepted such input
  silently and answered for the base character alone.
- `reduce().unique` is not normalized and is not "the JIS X 0213 form" of the
  input. It can be a CJK compatibility ideograph (165 source characters —
  `reduce("楳").unique` is U+FA44), and because MJ's JIS包摂規準 evidence
  carries neither a rank nor a hop count it never wins the selection, so a
  character MJ records as already representable can still be folded
  (`reduce("㐂").unique` is 喜). Both are documented in the README now;
  neither is a change in behavior.
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
- Every advertised runtime is exercised in CI against the built artifact:
  Node 18 (via the packed tarball, through both `require()` and `import()`),
  Node 20 and 22 (full suite), headless Chromium, and workerd — the runtime
  Cloudflare Workers uses. Deno, Bun and non-Chromium browsers are not
  covered.
