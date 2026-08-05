# mj-shrink-map

[日本語版 README はこちら](./README.ja.md)

Grounded kanji-variant (itaiji, 異体字) normalization, equivalence checking,
and matching-key generation for Japanese text, backed by IPA's **MJ Shrink
Map** (MJ縮退マップ) — a public dataset, not a hand-curated dictionary.

Dependency-free. All data ships inside the package; nothing is fetched over
the network at build or run time. Node.js 18+ is verified in CI by installing
the published tarball on Node 18 and exercising both `require()` and
`import()`; browsers and Cloudflare Workers are supported targets but are not
yet exercised in CI (see [Known limitations](#known-limitations)).

## Why this exists

Japanese names and place names carry a lot of kanji variants (﨑/崎, 髙/高,
邊/邉/辺, ...), which breaks naive string matching. The existing popular
option, the `itaiji` npm package, is a hand-built dictionary of about 1,400
one-way old-form → new-form pairs, with no cited evidence and no support for
IVS (Ideographic Variation Sequences).

This package is built from the MJ Shrink Map instead: a dataset published by
Japan's Character Information Technology Promotion Council / IPA that
documents character relations with their legal/lexicographic basis (family
register notices, MOJ notice 582 appendix 4, JIS inclusion rules,
dictionaries, or reading/shape analogy). During the pre-implementation study
for this package we found it covers about **19x more distinct
character-to-character pairs** than the `itaiji` dictionary, plus IVS
support that `itaiji` has no concept of at all. See
[`docs/phase0-report.md`](./docs/phase0-report.md) for the full numbers.

**This is not a drop-in replacement for `itaiji`.** MJ Shrink Map reduces
characters to a form representable in JIS X 0213 — it is not a
new-orthography (shinjitai) normalizer. About 86% of `itaiji`'s 1,404 pairs
are captured as an equivalence relation here, but pairs where both sides are
already independently JIS-representable (e.g. 啞→唖, 鷗→鴎) are not
"reduced" by this data, since neither side needs shrinking. If your use case
is specifically old-style→new-style kanji substitution, check whether that
distinction matters for you.

## Install

```sh
npm install mj-shrink-map
```

## API

```ts
import { reduce, isVariant, getVariants, toMatchingKey } from "mj-shrink-map";

reduce("﨑");
// {
//   input: "﨑",
//   candidates: [
//     { char: "崎", basis: ["family-register-notice"] },
//     { char: "﨑", basis: ["jis-inclusion-rule"] },
//   ],
//   unique: "崎",
//   resolvedVia: "base",
// }

isVariant("﨑", "崎"); // true
isVariant("崎", "高"); // false

getVariants("崎");
// 5 entries, in no meaningful order: 㟢 嵜 陭 﨑 𡼋
// [{ char: "㟢", basis: [...] }, { char: "嵜", basis: [...] }, ...]

toMatchingKey("田中﨑");
// { key: "田中崎", unresolved: [] }
```

### `reduce(char): ReduceResult`

Looks up one character — optionally followed by a single Ideographic or
Standard Variation Selector, e.g. `"辻\u{E0100}"` — and returns every
JIS X 0213-representable candidate it's recorded against, each with the
category of evidence (`basis`) that supports it.

Throws a `TypeError` if `char` is not a string, or is not exactly one such
unit. This is deliberate: silently processing only the first character of a
longer string, or accepting an array of names as if it were one name, hides
bugs that produce plausible-looking wrong output. More than one variation
selector is rejected for the same reason — reducing only the first would
discard the rest. Use `toMatchingKey` for whole strings.

`unique` is a single representative pick, or `null` when there are zero
candidates, or when the candidates are tied under the built-in selection
heuristic and picking one would be an unprincipled guess. The heuristic
prefers, in order: the priority rank recorded in MOJ Notice 582 Appendix 4;
failing that, the lowest hop count recorded in a family register notice;
failing that, it returns `null` rather than picking arbitrarily (e.g. by
code point). This is an original heuristic documented in
[`src/reduce.ts`](./src/reduce.ts) — not a port of any other tool's
algorithm.

`resolvedVia` reports which table entry answered the lookup: `"ivs"` or
`"svs"` when the input's own variation sequence was found, `"base"` when it
fell back to the plain base character (or had no selector to begin with), and
`"none"` when nothing matched at all. It is the only way to tell a genuine
IVS-specific answer from a fallback.

Note that `reduce` performs a **single** step of the relation. Many
characters need several before reaching one that reduces to itself, so for
matching keys use `toMatchingKey`, which iterates to that fixed point.

### `isVariant(a, b): boolean`

True if `a` and `b` are directly connected in the MJ variant graph: one
reduces to the other, or both are recorded as alternate JIS-representable
forms of the same MJ source glyph. This is a **direct** relation, not the
transitive closure of the whole graph — some evidence categories (general
dictionaries, reading/shape analogy) chain into large connected components
that would over-merge distinct characters if treated as transitively equal.
See [`docs/phase0-report.md`](./docs/phase0-report.md) #6 for the component
sizes we measured.

### `getVariants(char): Candidate[]`

Lists every character directly related to `char` (see `isVariant` above),
each with its evidence. Order carries no meaning. Use this for query
expansion — e.g. searching for "崎" and also matching documents containing
"﨑".

### `toMatchingKey(text, options?): { key, unresolved }`

Builds a name-matching key by reducing every character in `text` to a stable
representative — repeatedly, until it reaches a character that reduces to
itself, since most characters need more than one step. Characters that
cannot be resolved are left unchanged in `key` and reported in `unresolved`
with their index in the (normalized) string. This function never silently
guesses.

`reason` is one of:

| reason | meaning |
| --- | --- |
| `"no-candidate"` | the character has no MJ Shrink Map entry at all |
| `"ambiguous"` | its candidates are tied under `reduce`'s heuristic, at the start of the chain or partway along it |
| `"cycle"` | every step was unambiguous, but the chain revisits a character instead of settling (e.g. 址 and 阯 reduce to each other) |
| `"unsupported-sequence"` | the base character carried more than one variation selector, so the unit was passed through untouched |

**Only ideographs are reported in `unresolved`.** Kana, latin letters,
digits, punctuation and whitespace are outside the MJ character set by
definition; listing them would bury the real signal — a routine address line
would otherwise produce 33 unresolved entries out of 34 characters, and the
natural caller check `if (result.unresolved.length)` would fire on
essentially every input. Non-ideographs still pass through into `key`
unchanged.

`options.unicodeNormalize` defaults to `"NFKC"`: our phase 0 study found
that 460 of the 474 CJK Compatibility Ideographs collapse into a unified
ideograph under NFKC/NFC, so running that first before the MJ lookup covers
those for free. The stable remainder (including well-known cases like 髙,
邊, 濵) is exactly what the MJ table is for. Pass `false` to see MJ's
contribution to normalization in isolation, or `"NFC"` to keep compatibility
ideographs distinct.

## IVS support

MJ glyph names in the Character Information List frequently carry an IVS
(Ideographic Variation Selector, U+E0100–U+E01EF) or SVS — about 11,000 of
the ~59,000 MJ entries in the version this package was built from, producing
9,973 variation-sequence lookup keys. `reduce`, `isVariant`, and
`getVariants` all accept a base character immediately followed by one
variation selector as a single input unit. If the specific sequence isn't
found, `reduce` falls back to the base character's entry and says so via
`resolvedVia: "base"`.

Standard Variation Selectors are accepted in the range **U+FE00–U+FE0D
only**. U+FE0E and U+FE0F are Unicode's text and emoji *presentation*
selectors, not ideographic variation selectors, and U+FE0F in particular
appears constantly in ordinary text as part of emoji — treating it as a
variation selector would mean silently swallowing it. Narrowing the range
costs nothing here: the only SVS selectors the MJ data actually uses are
U+FE00 and U+FE01. So `toMatchingKey("㊗️")` keeps its U+FE0F.

One consequence worth knowing: because U+FE0F is no longer a variation
selector, `"崎️"` is two characters rather than one unit, so the
single-character functions (`reduce`, `isVariant`, `getVariants`) throw on it
instead of quietly treating it as 崎. `toMatchingKey` handles such strings
normally.

## Data provenance and license

This package has two licenses:

- **Code**: MIT — see [`LICENSE`](./LICENSE)
- **Bundled data** (derived from the MJ Shrink Map and MJ Character
  Information List, both © IPA): **CC BY-SA 2.1 Japan** — see
  [`LICENSE-DATA`](./LICENSE-DATA)

The ShareAlike clause means that distributing a derivative of the bundled
data (including the generated table file) requires the same license and
attribution. It does not extend to the MIT-licensed code that reads the
data. See `LICENSE-DATA` for details.

Original data files are kept unmodified in `data/snapshot/` in the source
repository, with retrieval dates, versions, and SHA-256 hashes recorded in
[`PROVENANCE.md`](https://github.com/tomatomerde/itaiji-library/blob/main/data/snapshot/PROVENANCE.md),
which is also shipped inside the npm package. Nothing is fetched from the
network at build or run time — regenerating the tables from an updated
snapshot is a local script (`npm run build:tables`).

In the published package the licensed data is not a separate file: it is
compiled into `dist/index.js` and `dist/index.cjs`. `LICENSE-DATA` names
those explicitly.

## Support and scope

- Character coverage: the union of the MJ character set (戸籍統一文字 +
  住基ネット統一文字, ~58,900 MJ glyphs in Ver.006.02) reducible to JIS X
  0213, giving 30,395 distinct source characters and 9,973 variation-sequence
  keys. Ideographs outside MJ (e.g. Chinese simplified forms such as 龟) are
  not covered — `reduce`/`getVariants` return no candidates for them, and
  `toMatchingKey` reports them as `"no-candidate"`.
- Ambiguity is never hidden: multiple/zero candidates and ambiguous
  `unique` results are explicit, not silently resolved. See
  [`docs/phase0-report.md`](./docs/phase0-report.md) for the measured
  distribution (about 39% of MJ entries have zero shrink candidates, about
  49% exactly one, and about 12% multiple).
- **Disclaimer**: this package does not guarantee identity determination for
  family register, legal, or financial use. It is a text-normalization aid,
  not a legal-equivalence authority.

## Known limitations

Measured, not estimated. Please weigh these before adopting.

**Bundle size.** The tables are large. Approximate figures, minified and
gzipped, measured with `esbuild --bundle --minify --format=esm` (expect a few
KB either way depending on your bundler and its version):

| what you import | gzip |
| --- | --- |
| `isVariant` only | ~281 KB |
| `reduce` only | ~270 KB |
| `toMatchingKey` | ~271 KB |
| the whole API | ~552 KB |

The generated tables carry `/* @__PURE__ */` annotations so bundlers can drop
the ones you don't reach; without them every consumer paid the full 552 KB.
If you use the whole API you still pay all of it, which on Cloudflare Workers
is over half the 1 MB gzipped budget. Re-encoding the tables more compactly
is on the roadmap and not done yet.

**`unicodeNormalize: "NFKC"` (the default) does more than fold kanji.** NFKC
is a compatibility normalization, so it also rewrites things you may not
expect: `㈱`→`(株)`, `№`→`No`, `①②③`→`123`, `㌢`→`センチ`, `ﬁ`→`fi`,
`Ⅻ`→`XII`. That is usually what you want for name matching, but it means the
key can be longer than the input. Pass `"NFC"` or `false` if you need the
input's shape preserved.

**Full ICU is required.** `String.prototype.normalize` needs full ICU data.
Official Node.js builds have it; a Node compiled with
`--with-intl=small-icu` (or `none`) will not normalize correctly. Pass
`unicodeNormalize: false` if you must run on such a build.

**Throughput.** Roughly 0.5–0.7 million `toMatchingKey` calls/second on short
names (100,000 names in ~150–210 ms across the machines we measured on, Node
22) — treat it as an order of magnitude, not a promise. There is no
cross-call cache, on purpose: that would be hidden global state. If you are
normalizing millions of rows and want more, memoize per character on your
side.

**Not yet verified in CI**: execution in a browser or on Cloudflare Workers.
Node 18, 20 and 22 are covered, and Node 18 specifically by installing the
published tarball and calling it through both `require()` and `import()`.

## FAQ: why is there no `reverse()`?

The MJ Shrink Map is a many-to-one relation (many MJ glyphs reduce to the
same JIS-representable form). Going the other way — "given this new-style
character, what was the one original old-style character?" — has no single
correct answer in general: our phase 0 study found up to 4+ distinct source
candidates for some targets, with no additional evidence to break the tie in
many cases. A `reverse()` that silently picked one would produce
plausible-looking but unjustified output. Use `getVariants()` to enumerate
the candidates with their evidence, and make the selection in your own
application where you have the context (or human judgment) to do so
responsibly.

## Roadmap / not in v1

- No hosted API / web service (this is a library, not a service)
- No integration of the Ministry of Justice's 誤字俗字・正字一覧 (Notice
  民一2842号 appendix) — see `docs/phase0-report.md` #4; this requires
  network access this project's environment didn't have during the phase 0
  study, so its machine-readability was not verified
- Tables are stored as plain JSON. A compact re-encoding (shared target
  dictionary, code point delta encoding) would cut the whole-API bundle
  well below the current 552 KB gzip; designed in the phase 0 study, not
  yet implemented
- Browser and Cloudflare Workers execution is not yet covered by CI
- No Python port yet (depends on adoption of the TypeScript version)

## Development

```sh
npm install
npm run build:tables   # regenerate src/generated/tables.ts from data/snapshot/
npm run build           # ESM + CJS + .d.ts via tsup
npm test                # vitest
npm run typecheck
```
