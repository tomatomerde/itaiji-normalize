# Contributing

Thanks for looking at `itaiji-normalize`. This document is for human contributors: it describes
what the project promises its users and how to work on it without breaking those promises. (If
you're an AI agent working on this repo, read `CLAUDE.md` instead — different document, different
assumptions. `NOTES.md` carries the session-to-session state.)

## What this project must never do

These aren't style preferences. Each one exists because breaking it produces an answer that looks
authoritative and isn't — and the whole reason to pick this library over a hand-written dictionary
is that its answers are traceable to a public source.

- **Never invent a mapping.** Every relation this library reports comes from IPA's MJ Shrink Map
  (MJ縮退マップ), carried in this repository as a snapshot. If the data doesn't record a relation,
  the correct output is "no candidates," not a plausible-looking guess. The existing OSS in this
  space uses hard-coded dictionaries with no cited basis; that difference is the point of the
  package, and a single invented entry erases it.

- **Never resolve ambiguity silently.** When shrinking yields several candidates, or none, the API
  says so. `unique` is offered as a *separate* field precisely so that callers who need one answer
  opt into it knowingly. Do not make a multi-candidate case quietly pick a winner, and do not drop
  the `unresolved` reporting to make an example read better.

- **`pickUnique` is an original heuristic with no external backing, and the README says so.** It was
  validated against IPA's own reference implementation, not against a specification — MJ's published
  guidance treats choosing among candidates as the user's contextual judgement and never tells an
  implementer to use rank or hop count. If you change the heuristic, change the documentation with
  it. Do not upgrade its described status: it is not "the standard way," and claiming otherwise
  would be the one thing this library refuses to do to its users.

- **The 23 cycling characters stay unresolved.** 址/阯, 雕/鵰, 羐/羑, 輀/轜, 㿉/㿗 and the rest
  shrink into each other without settling. Fourteen of them list themselves as a candidate (via
  JIS包摂規準), so a stable form exists inside the cycle — but *both* characters have that property,
  so there is no basis for electing either as the representative. Normalizing to the lowest code
  point in the cycle would make 址 and 阯 match, and it would also mean announcing a representative
  character the data never chose. They are reported as `unresolved` with `reason: "cycle"` so
  callers who need a policy can apply their own. This was decided deliberately (2026-08-05); please
  don't reopen it with a patch that just picks one.

- **Never fetch at build or run time.** The snapshot lives in the repository, with its acquisition
  date, version, URL and hash recorded in `data/snapshot/PROVENANCE.md`. `scripts/verify-snapshots.sh`
  checks the files against those hashes. A dependency on a live endpoint would break the offline
  guarantee and make builds non-reproducible.

- **An edge with no evidence bits is a bug, not an edge.** `addEdge` refuses to emit one. Evidence
  is what separates this library from a dictionary; an unattributed relation is indistinguishable
  from an invented one.

- **Watch the licence boundary.** Code is MIT; the bundled data is CC BY-SA 2.1 JP and IPA's work.
  Share-alike propagates to derivatives *of the data*. If you add, transform, or re-export dataset
  content, check that the attribution and licence notices still hold — `LICENSE-DATA` and the README
  both carry them.

- **Keep `LICENSE` as the verbatim MIT text, with nothing appended.** GitHub detects a repository's
  licence by matching that file against known licence texts, and it is an exact-ish match: a note
  added at the end is enough to make it give up. This repository used to carry a short paragraph
  there pointing at `LICENSE-DATA`, and the result was that GitHub reported the licence as
  `NOASSERTION` — no licence chip in the sidebar, nothing in the API — which to a cautious reader
  means "all rights reserved" on an MIT project. The two-part licensing is explained in
  `LICENSE-DATA`, in the README's *Data provenance and license* section, and in the two README
  badges; that is where it belongs. Adding it back to `LICENSE` would be a regression.

## Out of scope

Proposals for these have been considered and declined; a PR implementing one will be closed rather
than reviewed on its merits:

- A hosted API or web service.
- A reverse API that maps a modern form to one specific traditional form. The data offers no basis
  for picking one, so the answer would be invented. The README explains this as an FAQ.
- Integrating the Ministry of Justice 誤字俗字・正字一覧 (v1 ships the investigation only).
- A Python port (deferred until the TypeScript package finds users).

And a disclaimer that matters more than it looks: **this library does not certify identity for
family-register, legal, or financial purposes.** Please don't file issues asking it to.

## Getting set up

Node.js 18+. No pnpm here — plain `npm`.

```sh
npm ci
npm run build:tables   # regenerate src/generated/tables.ts from data/snapshot/
npm run build          # tsup: ESM + CJS + .d.ts
```

`src/generated/tables.ts` is generated and committed. Committing it is what makes the build
reproducible and the package dependency-free; regenerate it rather than editing it by hand, and
check that the result is byte-identical when you didn't intend a data change.

## Checking your work locally

```sh
npm test                        # vitest
npm run typecheck
./scripts/verify-snapshots.sh   # snapshots vs the hashes in PROVENANCE.md
npm run build && npm run test:browser   # dist in headless Chromium
npm run build && npm run test:workers   # dist in workerd (Cloudflare Workers)
```

The browser check resolves Chromium through `scripts/verify-browser.mjs`: `CHROMIUM_PATH` if set,
then the default preinstalled location, then Playwright's own resolution. The order exists because
some environments ship a Chromium whose revision doesn't match what Playwright expects; the reasons
are in that file's `resolveExecutablePath` comment.

## Adding or changing tests

**A test that doesn't fail when you break the code isn't protecting anything.** After adding one,
deliberately break the code path it covers and confirm the test goes red. Several tests in this
suite exist because that exercise found one that never ran.

Don't derive an expected value from this implementation's own output — if the implementation is
wrong, the test agrees with it. Use an independent route: a reference implementation, the source
data read by hand, or the published documentation.

## Branches and pull requests

Work on a branch and open a pull request. Direct pushes and force pushes to `main` are not used
here. Write commit messages that say **why**, not what — the diff already shows what, and the
reason is the part that gets lost.

Before you start, run `git log --oneline --all --graph` and look for parallel branches. Two
branches once claimed the same review round and fixed the same finding in incompatible ways; the
reconciliation cost more than either fix. `NOTES.md` tells that story near the top.

## Language

Code comments, JSDoc and error messages are in English. Test descriptions may be Japanese. Both
READMEs (`README.md` and `README.ja.md`) are maintained; a change to user-facing behavior should
update both.
