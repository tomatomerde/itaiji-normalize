# itaiji-normalize

[![npm](https://img.shields.io/npm/v/itaiji-normalize.svg)](https://www.npmjs.com/package/itaiji-normalize)
[![CI](https://github.com/tomatomerde/itaiji-normalize/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/itaiji-normalize/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Data: CC BY-SA 2.1 JP](https://img.shields.io/badge/data-CC%20BY--SA%202.1%20JP-lightgrey.svg)](./LICENSE-DATA)
[![Node.js 18+ · browsers · Workers](https://img.shields.io/badge/runs%20on-Node%2018%2B%20%C2%B7%20browsers%20%C2%B7%20Workers-brightgreen.svg)](#install)
[![module: ESM + CJS](https://img.shields.io/badge/module-ESM%20%2B%20CJS-blue.svg)](#install)
[![dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](./package.json)
[![demo: try it in the browser](https://img.shields.io/badge/demo-try%20it%20in%20the%20browser-blue.svg)](https://tomatomerde.github.io/itaiji-normalize/)

**English** | [日本語](./README.ja.md)

Grounded kanji-variant (itaiji, 異体字) normalization, equivalence checking,
and matching-key generation for Japanese text, backed by IPA's **MJ Shrink
Map** (MJ縮退マップ) — a public dataset, not a hand-curated dictionary.

Dependency-free, shipped as both ESM and CommonJS, and runs unchanged on
**Node.js 18+, in browsers, and on Cloudflare Workers**. All data ships inside
the package; nothing is fetched over the network at build or run time. (Each
of those runtimes is exercised in CI against the built artifact — the details
are under [Support and scope](#support-and-scope).)

**[Try it in your browser](https://tomatomerde.github.io/itaiji-normalize/)** — the
demo runs the published package client-side. Open DevTools' Network panel while
you type: it makes no requests after the page has loaded.

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
npm install itaiji-normalize
```

Two conditions are worth knowing before you commit to it, because both fail
*after* the install rather than during it — full details under
[Known limitations](#known-limitations):

- **The bundled tables are large**: ~280–290 KB gzipped even for a single
  entry point, **~570 KB for the whole API**. On Cloudflare Workers that is
  over half the 1 MB budget. Import only what you use — the tables carry
  `/* @__PURE__ */` annotations so bundlers can drop the rest.
- **Full ICU is required** for the default `unicodeNormalize: "NFKC"`.
  Official Node builds, Chromium and workerd all have it; a Node built with
  `--with-intl=small-icu` does not, and will produce different keys unless you
  pass `unicodeNormalize: false`.

## At a glance

```ts
import { reduce, isVariant, getVariants, toMatchingKey } from "itaiji-normalize";

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
// { key: "田中崎", normalized: "田中﨑", unresolved: [] }
```

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

## Support and scope

- Character coverage: the union of the MJ character set (戸籍統一文字 +
  住基ネット統一文字, ~58,900 MJ glyphs in Ver.006.02) reducible to JIS X
  0213, giving 30,345 distinct source characters and 9,950 variation-sequence
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
- **Version `0.x`: the API may change.** This is a personal project,
  maintained on a best-effort basis. Issues and pull requests are welcome, but
  response times are not guaranteed. The software is provided as is, without
  warranty of any kind, as stated in the MIT licence.
- **Every runtime claimed above is exercised in CI against the built
  artifact**, not the source: **Node.js 18+** (the published tarball is
  installed on Node 18 and called through both `require()` and `import()`,
  plus the full suite on Node 20 and 22), **browsers** (the ESM bundle loaded
  as a module script in headless Chromium), and **Cloudflare Workers** (the
  bundle running inside workerd, the runtime Workers actually uses). What CI
  does *not* cover is listed under [Known limitations](#known-limitations).

## Known limitations

Measured, not estimated. Please weigh these before adopting.

**Bundle size.** The tables are large. Approximate figures, minified and
gzipped, measured with `esbuild --bundle --minify --format=esm` (expect a few
KB either way depending on your bundler and its version):

| what you import | gzip |
| --- | --- |
| `isVariant` only | ~287 KB |
| `reduce` only | ~282 KB |
| `toMatchingKey` | ~282 KB |
| the whole API | ~568 KB |

`reduce` and `toMatchingKey` grew by about 11 KB each in 0.1.3 — they now
pull in the `KANJI_POLICY` table (2,999 entries) that backs the
常用漢字/人名用漢字 tiebreak described under [`reduce`](#reducechar-reduceresult).
`isVariant` doesn't consult that table, so it is essentially unchanged. The
whole-API bundle only grew by about 6 KB, since bundling both functions
together shares one copy of the table instead of paying for it twice.

The generated tables carry `/* @__PURE__ */` annotations so bundlers can drop
the ones you don't reach; without them every consumer paid for all of them.
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
Official Node.js builds have it, and so do Chromium and workerd — the CI
browser and Workers jobs assert that NFKC actually folds, so a runtime
missing ICU would fail there rather than silently produce different keys. A
Node compiled with `--with-intl=small-icu` (or `none`) will not normalize
correctly; pass `unicodeNormalize: false` if you must run on such a build.

**Throughput.** Roughly 0.5–0.7 million `toMatchingKey` calls/second on short
names (100,000 names in ~150–210 ms across the machines we measured on, Node
22) — treat it as an order of magnitude, not a promise. There is no
cross-call cache, on purpose: that would be hidden global state. If you are
normalizing millions of rows and want more, memoize per character on your
side.

**What CI does not cover.** Runtimes other than Node 18/20/22, headless
Chromium and workerd — notably Deno, Bun, and non-Chromium browsers. Nothing
in the bundle is engine-specific, but that is reasoning, not evidence, so
treat those as unverified.

## API reference

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
candidates, or when the candidates are still tied after every tier of the
built-in selection heuristic and picking one would be an unprincipled guess.
The heuristic prefers, in order: the priority rank recorded in MOJ Notice 582
Appendix 4; failing that, the lowest hop count recorded in a family register
notice; failing that, whichever tied candidate is 常用漢字 (the Jōyō kanji
list), if exactly one of them is — or, if none are, whichever is 人名用漢字
(kanji permitted in given names beyond the Jōyō list), broken by lowest
JIS水準 if more than one of those is tied too; failing all of that, it returns
`null` rather than picking arbitrarily (e.g. by code point). Of the 806 table
keys where rank and hop leave a tie, this last tier resolves 502 of them
outright; the remaining 304 have no 常用漢字/人名用漢字 candidate to decide
between (or more than one at the same level) and stay `null`.

The rank and hop tiers are an original heuristic documented in
[`src/reduce.ts`](./src/reduce.ts) — not a port of any other tool's
algorithm. **The 常用漢字/人名用漢字 tier is not original**: it is the same
rule IPA's own reference implementation applies once its own rank/hop-style
tiers run out, used verbatim rather than reinvented, and it is backed by a
2,999-entry table built from the same 常用漢字/人名用漢字 policy lists the
reference implementation reads (2,136 常用漢字, 863 人名用漢字). MJ itself
does not prescribe any of this: its published guidance says that when
several candidates are listed you should judge the actual target from the
context the character is used in, and offers rules such as "prefer the
常用漢字" or "prefer the lowest JIS code" only as examples. The rank and hop
fields are this package's reading of the data; the 常用漢字/人名用漢字 tier
is the reference implementation's.

IPA does publish a reference program that picks one candidate
([mandel59/mj2jisx0213](https://github.com/mandel59/mj2jisx0213), MIT,
© 2015 IPA). **The rules that remain different from this package are down to
tier order, not the tiebreak itself anymore.** The reference takes
JIS包摂規準 first when present, then the family-register notices (by hop
count), and treats MOJ Notice 582's rank as the *last* resort — before
falling through to the same 常用漢字 → 人名用漢字 (by JIS level) tiebreak
this package now applies. This package puts MOJ Notice 582's rank first and
JIS包摂規準 last. The difference follows from a different goal: the
reference produces a JIS X 0213 conversion table, so "this glyph is already
representable" ends the question, whereas this package builds matching keys,
where folding 㐂 onto 喜 is the point. Measured over the shipped tables,
putting rank ahead of hop instead of behind it picks a different winner for
248 source characters, and rank does not always pick the more common form
(for 㓮, rank gives the rare 雕 where hop gives the everyday 彫). If you need
the reference's tier order, use the reference.

Two consequences of that heuristic are worth knowing before you use
`unique` as a key:

- **`unique` can be a CJK compatibility ideograph** (165 source characters),
  and those are not NFKC-stable: `reduce("楳").unique` is U+FA44, which NFKC
  turns into U+6885 梅. `toMatchingKey` normalizes after every hop so its
  key is unaffected — if you build keys from `unique` yourself, normalize
  it.
- **A character that MJ says needs no shrinking can still be replaced.** The
  JIS包摂規準・UCS統合規則 category usually names the character itself, which
  is MJ's way of saying "already representable"; that entry carries neither
  a rank nor a hop count, so it never wins the rank/hop tiers above, and
  usually has no 常用漢字/人名用漢字 status of its own either. For 1,288
  source characters the result is a genuine fold (`reduce("㐂").unique` is
  喜, `reduce("㠀").unique` is 島) — useful for name matching, but it means
  `unique` is not "the JIS X 0213 form of this glyph". For 5 more such
  characters the candidates tie even after the 常用漢字/人名用漢字 tier and
  `unique` is `null`.

`resolvedVia` reports which table entry answered the lookup: `"ivs"` or
`"svs"` when the input's own variation sequence was found, `"base"` when it
fell back to the plain base character (or had no selector to begin with), and
`"none"` when nothing matched at all. It is the only way to tell a genuine
IVS-specific answer from a fallback.

Note that `reduce` performs a **single** step of the relation. Many
characters need several before reaching one that reduces to itself, so for
matching keys use `toMatchingKey`, which iterates to that fixed point.

### `isVariant(a, b, options?): boolean`

True if `a` and `b` are directly connected in the MJ variant graph: one
reduces to the other, or both are recorded as alternate JIS-representable
forms of the same MJ source glyph. This is a **direct** relation, not the
transitive closure of the whole graph — some evidence categories (general
dictionaries, reading/shape analogy) chain into large connected components
that would over-merge distinct characters if treated as transitively equal.
See [`docs/phase0-report.md`](./docs/phase0-report.md) #6 for the component
sizes we measured.

Returns `false` for a character against itself — this answers "are these two
*different* characters variants of each other", so write
`a === b || isVariant(a, b)` if you want an equivalence check.

#### `includeInferred` — recall or precision

`{ includeInferred?: boolean }`, default `true`. Inferred edges (see
`getVariants` below) are the ~10% where the two characters are related only
through being candidates of one shared MJ glyph. `getVariants` hands that
flag back per neighbour; a boolean cannot, so `isVariant` takes the option
instead.

```ts
isVariant("井", "牛");                            // true  — both replace a third glyph
isVariant("井", "牛", { includeInferred: false }); // false
```

**The default is `true` because the strict setting also loses real variant
pairs, not just spurious ones.** MJ registers a shrink relation only for a
glyph that *needs* shrinking, so two characters that are both already in
JIS X 0213 have no recorded edge between them and co-candidacy is the only
link the data has — which is the shape of many 新字体/旧字体 pairs:

```ts
// all true by default, all false with { includeInferred: false }
isVariant("猫", "貓");
isVariant("摂", "攝");
isVariant("併", "倂");
isVariant("靱", "靭");
isVariant("桝", "枡");
```

**`isVariant` returning `true` here doesn't mean the two fold to the same
`toMatchingKey` key.** 猫 and 貓 are each already a fixed point — every
character reduces to itself — so `toMatchingKey("猫").key` is `"猫"` and
`toMatchingKey("貓").key` is `"貓"`: two different keys. This is the same
split as `reduce`/`toMatchingKey` above, one level up: `isVariant` reports a
direct relation, `toMatchingKey` reports where reduction lands, and
co-candidacy supplies the first without giving `toMatchingKey` anything to
reduce. Working as designed, not a bug — MJ only records a shrink relation
for a character that needs one, and neither 猫 nor 貓 does.

34 characters have nothing but inferred edges, so the strict setting leaves
them with no variants at all. Recorded relations are unaffected either way:
沢–澤, 辺–邊, 斉–齊, 竜–龍, 桜–櫻, 国–國, 髙–高, 﨑–崎 are `true` in both.

Within those 3,000 inferred edges, **1,427 (47.6%) carry
`basis: ["moj-notice-582-appendix-4"]` alone** — the same shape as
`isVariant("井", "牛")` above: the notice ranking a third, rarer glyph's
candidates against each other, not a statement about the two characters
themselves. A sample pulled from that layer turned up no plausible variant
pairs (not exhaustively checked, so treat this as a sampling result, not a
count).

You don't have to choose between all 3,000 and none: `getVariants` already
exposes enough to drop just that layer:

```ts
function dropNotice582OnlyLayer(char: string) {
  return getVariants(char).filter(
    (v) => !(v.inferred && v.basis.length === 1 && v.basis[0] === "moj-notice-582-appendix-4"),
  );
}

dropNotice582OnlyLayer("井").map((v) => v.char); // ["㐄", "㐩"] — 牛 dropped
dropNotice582OnlyLayer("猫").map((v) => v.char); // ["貓"] — kept: basis also has family-register-notice
```

None of the pairs above are affected — their `basis` always carries
`jis-inclusion-rule` and `family-register-notice` alongside the notice, so
`basis.length === 1` never matches them. This sits between the two
`includeInferred` values: `true` keeps all 3,000 inferred edges, `false`
drops all of them (real pairs included), and this filter drops only the
sub-layer sampling didn't find real pairs in — a middle setting already
reachable from the data `getVariants` returns today.

Use `false` when a match is an assertion someone could be held to, and the
default when you are expanding a search.

### `getVariants(char): Variant[]`

Lists every character directly related to `char` (see `isVariant` above),
each with its evidence. Order carries no meaning. Use this for query
expansion — e.g. searching for "崎" and also matching documents containing
"﨑".

**Check `inferred` before quoting `basis` as an authority's word on the
pair.** About 10% of the graph's edges (3,000 of 30,653) exist only because
both characters are candidates of one shared MJ glyph, and on those the
`basis` describes that shared relationship rather than a statement about the
two characters themselves. MOJ Notice 582 says 齍 may be written 斉 or 資;
that makes 斉 and 資 related *through* 齍, but the notice never says the two
are interchangeable — so `getVariants("斉")` reports 資 with
`inferred: true`, while 齍, which the notice does name, comes back with
`inferred: false`.

### `toMatchingKey(text, options?): { key, normalized, unresolved }`

Builds a name-matching key by reducing every character in `text` to a stable
representative — repeatedly, until it reaches a character that reduces to
itself, since most characters need more than one step. Characters that
cannot be resolved are left unchanged in `key` and reported in `unresolved`.
This function never silently guesses.

**`unresolved[].index` indexes `normalized`, not your input string.**
Normalization changes lengths, so the offset can point past the end of what
you passed in — slice `normalized`:

```ts
const r = toMatchingKey("㍿㖒");   // NFKC turns ㍿ into 株式会社
r.normalized;                      // "株式会社㖒"
r.unresolved[0].index;             // 4 — past the end of the 2-char input
r.normalized.slice(4);             // "㖒"  ✓
```

`normalized` is the input after Unicode normalization and before any MJ
reduction; with `unicodeNormalize: false` it equals the input.

`reason` is one of:

| reason | meaning |
| --- | --- |
| `"no-candidate"` | the character has no MJ Shrink Map entry at all |
| `"ambiguous"` | its candidates are tied under `reduce`'s heuristic **and lead to different fixed points**, at the start of the chain or partway along it |
| `"cycle"` | every step was unambiguous, but the chain revisits a character instead of settling (e.g. 址 and 阯 reduce to each other) |
| `"unsupported-sequence"` | the base character carried more than one variation selector, so the unit was passed through untouched |

A tie does not automatically mean unresolved. `reduce` refuses to name a
representative when candidates score equally, because doing so would be a
guess — but for a matching key the question is narrower: do the tied
branches lead anywhere different? Often they don't. 𡥨 ties between 㬜 and
晉, and both of those reduce onward to 晋, so every branch ends at the same
place and the choice provably could not have mattered. `toMatchingKey`
follows all tied branches and accepts the answer only when they agree, which
is a proof rather than a guess.

Of the 806 table keys (characters and variation sequences) whose candidates
tie under rank and hop, 502 are decided one step earlier by the
常用漢字/人名用漢字 tier inside `reduce`, a further 55 are resolved here by
branch agreement, and the remaining 249 are reported `"ambiguous"` (measured
with the default NFKC). **渡邉 matches 渡辺** either way — before any of
this, 渡邊 matched and 渡邉 did not, which is worse than either outcome
alone.

The division of labour still holds where a tie survives `reduce`:
`reduce("𡥨").unique` is `null` because naming one of 㬜 and 晉 the
representative would be a guess, while `toMatchingKey("𡥨").key` is 晋
because the guess turns out not to be needed.

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
9,950 variation-sequence lookup keys. `reduce`, `isVariant`, and
`getVariants` all accept a base character immediately followed by one
variation selector as a single input unit. If the specific sequence isn't
found, `reduce` falls back to the base character's entry and says so via
`resolvedVia: "base"`.

Only `reduce` (and `toMatchingKey`) consult the sequence-specific entries.
`isVariant` and `getVariants` accept the selector for input convenience but
look relations up at the base-character level — the variant graph is
recorded per character, not per sequence — so `getVariants("辻\u{E0100}")`
equals `getVariants("辻")`, and two sequences sharing a base are the same
character to `isVariant` (which therefore answers `false` for them, as it
does for any character against itself).

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
[`PROVENANCE.md`](https://github.com/tomatomerde/itaiji-normalize/blob/main/data/snapshot/PROVENANCE.md),
which is also shipped inside the npm package. Nothing is fetched from the
network at build or run time — regenerating the tables from an updated
snapshot is a local script (`npm run build:tables`).

In the published package the licensed data is not a separate file: it is
compiled into `dist/index.js` and `dist/index.cjs`. `LICENSE-DATA` names
those explicitly.

## Roadmap / not in v1

- No hosted API / web service (this is a library, not a service)
- No integration of the Ministry of Justice's 誤字俗字・正字一覧 (Notice
  民一2842号 appendix) — see `docs/phase0-report.md` #4; this requires
  network access this project's environment didn't have during the phase 0
  study, so its machine-readability was not verified
- Tables are stored as plain JSON. A compact re-encoding (shared target
  dictionary, code point delta encoding) would cut the whole-API bundle
  well below the current ~568 KB gzip; designed in the phase 0 study, not
  yet implemented
- No Deno or Bun coverage in CI (Node, Chromium and workerd are covered)
- No Python port yet (depends on adoption of the TypeScript version)

## Development

```sh
npm install
npm run build:tables   # regenerate src/generated/tables.ts from data/snapshot/
npm run build          # ESM + CJS + .d.ts via tsup
npm test               # vitest
npm run typecheck
npm run test:browser   # run the built bundle in headless Chromium
npm run test:workers   # run the built bundle in workerd (Cloudflare Workers)
```
