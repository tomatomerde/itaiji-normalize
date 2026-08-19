# Changelog

Notable changes to this package. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Documented

- Both READMEs now answer the question a reader asks before installing
  anything: **is `String.normalize("NFKC")` enough?** Measured, not asserted —
  of the 27,661 character-to-character reductions in the shipped data, NFKC
  folds 77 (0.3%), NFC folds the same 77, and none of the seven surname
  variants anyone actually hits (﨑/崎, 髙/高, 邉/辺, 邊/辺, 德/徳, 濵/浜,
  栁/柳) is among them. Variation selectors survive normalization as well.
  The computation lives in `test/itaiji-comparison.test.ts` next to the
  `itaiji` comparison, sharing its denominator so the two percentages in the
  README are over the same set.
- `kanji-processor`, the other package npm surfaces for "kanji variant", is
  named and placed: a different job (異体字 → 親字 for Yomitan), from a
  commercial dictionary, with the package's MIT notice covering the code and
  nothing said about the data.

## 0.2.0 — 2026-08-17

### Changed (behaviour)

- **`toMatchingKey` now drops spacing from `key`.** `渡辺 太郎` and `渡辺太郎`
  produced two different keys, so the same person landed in two groups —
  which is the one thing a matching key exists to prevent. Whether a record
  puts a space between surname and given name is not a fact about the person,
  and in real name data both spellings occur. Every space, tab, newline and
  full-width space is now removed, along with leading, trailing and doubled
  ones. Collapsing to a single space would not have fixed it: "with a space"
  and "without a space" would still differ.

  Invisible formatting characters go with them — zero-width space, BOM, soft
  hyphen, the bidi controls (Unicode's `Cf` category). Those are the ones that
  actually hurt: they survive a copy out of a spreadsheet or a PDF, and two
  records that look identical on screen do not match, with nothing on screen
  to explain why. Variation selectors are `Mn`, not `Cf`, and are untouched —
  pinned by the existing U+FE0F invariants.

  This changes `key` for any input containing spacing, hence the minor bump
  under 0.x. Pass `ignoreWhitespace: false` for the previous behaviour.
  `normalized` keeps the spacing either way, so `unresolved[].index` is
  unaffected.

  Deliberately still **not** folded: `・` and other separators (part of
  transliterated names — ジョン・スミス), `ー` versus `―`, and hiragana versus
  katakana. Each changes what the text says; deciding two of them mean the
  same thing is the sort of guess this library leaves to the caller. Reported
  by the repository owner while trying the demo page.

### Added

- `toMatchingKey` option `ignoreWhitespace` (default `true`).

## 0.1.4 — 2026-08-13

### Fixed

- README (both languages) shipped in 0.1.3 still said `reduce("邉").unique`
  is `null`. The 常用漢字 tier added in that same release decides it — 邉's
  candidates 辺 and 邊 tie, 辺 is a 常用漢字, so `unique` is now 辺. The
  sentence was left over from the version before, contradicting the code it
  documents in the release that changed it. The passage now uses 𡥨 (whose
  candidates 㬜 and 晉 still tie, and whose key is 晋 because both branches
  reach it), which demonstrates the same `reduce`/`toMatchingKey` division of
  labour with a case that survives the new tier.
- The same passage said 557 of the 806 tied keys "resolve this way", crediting
  branch agreement for all of them. Measured: 502 are decided one step earlier
  by the 常用漢字/人名用漢字 tier inside `reduce`, 55 by branch agreement in
  `toMatchingKey`, and 249 remain `"ambiguous"`.

### Added

- `test/readme-claims.test.ts` pins every per-character claim the READMEs make
  (`reduce("楳").unique` is U+FA44, `getVariants("崎")` has five entries, the
  filtering example drops 井–牛 but keeps 猫–貓, …) and greps both files for
  the characters involved. 0.1.2 pinned the *statistics* after they drifted;
  the per-character claims were still unguarded, which is how the 邉 sentence
  above shipped.

## 0.1.3 — 2026-08-13

### Added

- `reduce().unique` now breaks a remaining rank/hop tie by 常用漢字
  (Jōyō kanji), then by 人名用漢字 (JIS水準 as the final tiebreak) — the same
  rule IPA's own reference implementation (`mandel59/mj2jisx0213`) applies
  once its own tiers run out, used verbatim rather than invented, and backed
  by a new 2,999-entry `KANJI_POLICY` table (2,136 常用漢字, 863 人名用漢字).
  Previously any tie that survived the rank/hop tiers returned `null`
  outright, even when the data plainly favored one candidate by a
  well-established government policy list. Of the 806 table keys where
  rank and hop leave a tie, this resolves 502 of them; `toMatchingKey`'s
  `"ambiguous"` count for those keys drops from 463 to 249 as a result (557
  now resolve). **No existing answer changed**: measured across the full
  40,295-key domain, `toMatchingKey` produced zero different answers and
  zero newly-unresolved keys against 0.1.2 — this tier only fills in
  previously-`null` results (245 new `toMatchingKey` resolutions, 504 new
  non-null `reduce().unique` values), it never overrides one.

### Fixed

- 付記=別字 exclusion was dropping candidates from categories the reference
  implementation never touches. 0.1.0 through 0.1.2 stripped a
  付記=別字-annotated character out of *every* evidence category it appeared
  in, but the reference implementation only rejects it from three
  categories — family register notices, MOJ Notice 582 Appendix 4, and
  general dictionaries — leaving JIS包摂規準・UCS統合規則 candidates alone.
  The over-broad exclusion silently deleted 5 legitimate candidates: 宮 from
  宫's candidate list, 亮 and 紀 and 記 from their respective IVS-qualified
  lookups, and 荒 from 𮎰. `reduce("宫").unique` is still 共, unchanged by
  this fix — the restored 宮 carries only JIS包摂規準 evidence (no rank, no
  hop), so it lands in the lowest tier and loses to 共, which does carry a
  MOJ Notice 582 rank. That's a separate, still-open question about tier
  design, not something this fix resolves.

### Changed

- Bundle size grew by about 8 KB gzipped for the entry points that reach the
  new `KANJI_POLICY` table. Measured with one command and one esbuild version
  against 0.1.2's published `dist/` and this one, so the two columns are
  comparable: `reduce` 273 → 281 KB, `toMatchingKey` 273 → 282 KB, the whole
  API 560 → 568 KB (bundling both functions shares one copy of the table
  rather than paying twice), and `isVariant`, which never touches that table,
  287 → 287 KB. These absolute figures differ by a few KB from the ones 0.1.1
  published because that table was measured with a different esbuild version;
  the README's table is now internally consistent, and the measurement method
  is stated next to it under "Known limitations".
- Data scale: 30,345 source characters (was 30,344) and 9,950
  variation-sequence keys (was 9,946) — 40,295 table keys in total — after
  the 付記=別字 fix above restored candidates the exclusion had wrongly
  removed. The variant graph now has 30,653 edges (3,000 inferred), up from
  30,650 (2,999 inferred).

## 0.1.2 — 2026-08-13

### Fixed

- `toMatchingKey` silently ignored unknown option keys: a misspelling like
  `{ normalize: "NFC" }` or `{ unicodeNormalise: false }` fell back to the
  default NFKC without any indication, while the caller believed they had
  opted out — the exact class of silent fallback this library documents
  itself as refusing. It now throws a `TypeError` naming the unknown key,
  matching what `isVariant` has done since 0.1.0. Valid options are
  unaffected.
- The statistics quoted in the README (both languages) and in the source
  JSDoc for the selection heuristic's limits were measured on the
  pre-release tables from *before* the 付記=別字 exclusion that shipped in
  0.1.0, and were never re-measured against the tables actually published:
  ties among candidates occur on 806 table keys, not 898, of which
  `toMatchingKey` resolves 343 by branch agreement (was 345/553); rank-first
  and hop-first selection disagree on 248 source characters, not 251; a
  self-candidate is folded away on 1,246 keys, not 1,277, and ends in a tie
  on 47, not 54. The claim that rank picks "the more common JIS level in 154
  of the disagreements but the rarer one in 49" was removed outright: its
  criterion was never reproducible from this repository (the verified 㓮
  example — rank→雕, hop→彫 — stays). All remaining figures are now pinned
  by tests, so the next data update fails loudly instead of letting the
  documentation drift again.
- The 0.1.1 entry below was dated 2026-08-11; the tag and the npm publish
  both happened on 2026-08-12.

### Added

- README (both languages) now states explicitly that `isVariant` and
  `getVariants` look relations up at the base-character level: a variation
  selector is accepted as input but does not narrow the lookup, so
  `getVariants("辻\u{E0100}")` equals `getVariants("辻")`, and two sequences
  sharing a base are the same character to `isVariant`. Only `reduce` and
  `toMatchingKey` consult the sequence-specific entries. This was previously
  documented only in source comments.

## 0.1.1 — 2026-08-12

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
