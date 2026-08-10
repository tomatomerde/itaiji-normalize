# Releasing

How `itaiji-normalize` gets to npm. The pipeline is
[`.github/workflows/release.yml`](../.github/workflows/release.yml); this page explains the parts
of it that a reader would otherwise have to reverse-engineer, and the two decisions that are easy
to get wrong.

## One-time setup (human, not automatable)

**`NPM_TOKEN`** — an Actions secret. Nothing publishes without it, and the workflow fails with an
explicit message naming the secret rather than letting a later `npm publish` return an opaque 401.

```sh
gh secret set NPM_TOKEN --repo tomatomerde/itaiji-normalize
```

Create the token at <https://www.npmjs.com/settings/~/tokens>. npm has merged classic and granular
token creation into a single form; the fields that matter:

| Field | Value | Why |
| --- | --- | --- |
| **Bypass two-factor authentication (2FA)** | **ticked** | Without it npm demands a one-time password on publish, which CI cannot supply |
| Packages and scopes → Permissions | **Read and write** | Defaults to read-only |
| Select packages | **All packages** | An unpublished name does not appear in the per-package picker, so the first publish of a new name needs account-wide scope. Narrow it afterwards |
| IP ranges | **leave empty** | GitHub-hosted runners have no stable egress IP |
| Organizations → Permissions | No access | Not needed |

**The 2FA checkbox is the one that bites, and it is invisible until the publish itself.** A token
created without it is rejected from CI with:

```text
npm error code EOTP
npm error This operation requires a one-time password from your authenticator.
```

This happened twice on the sibling project's `v0.1.0-rc.1` (2026-08-10) — nothing was published
either time, but each attempt cost a full pipeline run first. **Regenerating an existing token does
not change this setting**; a new token has to be created with the box ticked.
`scripts/npm-publish.sh` recognises `EOTP` and names the checkbox.

No dry run can validate the token, because dry runs never reach `npm publish` — which is the
strongest argument for the release-candidate procedure below.

Nothing else needs setting up. The workflow's own `permissions:` block grants `contents: write`
for the GitHub Release and `id-token: write` for provenance.

## Provenance

Every publish carries an npm provenance attestation, published as
`npm publish --provenance --access public`. **The `--access public` is not optional.** For a name
the registry does not know yet, npm refuses to mint an attestation unless access is stated
explicitly:

```text
npm error code EUSAGE
npm error Can't generate provenance for new or private package, you must set `access` to public.
```

An unscoped package is public by default, so the flag looks redundant, and npm still rejects it:
"default" is not "explicitly public". **This failed the first real `v0.1.0` tag push on
2026-08-10** — the sibling project survived only because its `package.json`s happened to carry
`publishConfig.access`. Both are set here now: the flag in `scripts/npm-publish.sh`, and
`publishConfig.access` in `package.json` so a manual publish behaves the same.

The attestation means the tarball
on npm can be traced to the commit and workflow run that produced it. Two things it depends on,
both easy to break without noticing:

- **`repository.url` in `package.json` must name this repository.** npm compares it against the
  repository the workflow runs in and **fails the publish** if they disagree — it does not quietly
  fall back to publishing without an attestation.
- **The repository must stay public.** npm provenance requires a public source repository.

Authentication is still `NPM_TOKEN`, not npm's tokenless "trusted publishing" OIDC flow — that
needs a trusted publisher configured on npm per package, which cannot be done before the package
exists. Worth revisiting once 0.1.0 is on the registry; provenance does not depend on it.

## Tag scheme and the dist-tag

One package, one tag shape: **`v<version>`**, e.g. `v0.1.0`. Anything else fails the run
immediately rather than guessing.

**A version containing a `-` publishes to the `next` dist-tag; everything else goes to `latest`.**
The workflow derives this from the version alone — there is no input for it.

This is not a nicety. `npm publish` with no `--tag` moves `latest` **even for a semver
prerelease** — npm does not special-case them. Publishing `0.1.0-rc.1` without `--tag next` would
make `npm install itaiji-normalize` hand every user the release candidate, and the only repair is
publishing a real version on top; in the meantime the mistake is public and looks exactly like a
successful release. The `Release plan` step summary prints the dist-tag for that reason.

**CHANGELOG headings are matched on the version as a whole field**, so `## 0.1.0-rc.1` and
`## 0.1.0` are different sections and each release gets only its own. A prefix match would treat
`## 0.1.0` as matching `## 0.1.0-rc.1 — …` as well, and because both headings match, the
"stop at the next heading" rule never fires — the extracted notes run to the end of the file.

## Release candidates, and what they do and do not protect

`npm publish` is the only step of this pipeline a dry run cannot exercise, and it cannot be undone:
npm keeps a published version forever, and unpublishing is limited to the first 72 hours with zero
dependents. The provenance attestation and the GitHub Release are also tag-push-only. That is the
case for rehearsing with a candidate first.

**But a candidate does less than it looks like it does for a brand-new name.** The sibling project
published `jp-address-romaji@0.1.0-rc.1` with `--tag next` on 2026-08-10 and found:

- **The first version ever published to a name becomes `latest` regardless of `--tag`.** The
  registry has to point `latest` somewhere, and on a new package there is nothing else to point at.
  `latest` cannot be deleted, so the only repair is publishing the real version. A candidate
  therefore does **not** keep `npm install <pkg>` clean on a first release — it only buys a
  rehearsal of the publish path.
- **A prerelease does not satisfy a caret range.** Any dependency or peer range written as
  `^x.y.z` will refuse a `x.y.z-rc.N`, which can make the candidate uninstallable. Ranges that need
  to admit prereleases must be written `^x.y.z-0`.

`itaiji-normalize` therefore went straight to `0.1.0`: the token path had already been proven for
real on the sibling project, and a candidate would have moved `latest` anyway while spending a
version number.

Cut a candidate when you want to rehearse a *changed* release path — not to protect a first
release, because it cannot.

## Cutting a release

1. Bump `version` in `package.json`.
2. Replace that version's `## <version> — unreleased` heading in `CHANGELOG.md` with the real date,
   e.g. `## 0.1.0 — 2026-08-12`. The workflow refuses to publish while it says `unreleased`, and
   the GitHub Release body comes from that section. Commit both changes.
3. `git tag v<version> && git push origin v<version>`.
4. Watch the run. The step summary carries the release plan (trigger, dry_run, version, dist-tag)
   and the full tarball listing; read them even on green.

If the version is already on the registry when the workflow runs — for instance you are re-pushing
a tag after a partial failure — the publish step detects it with `npm view` and skips rather than
erroring, so re-running is safe.

## Dry runs

Actions tab → **Release** → **Run workflow**, with `dry_run` left at `true`. Everything except
`npm publish` runs identically, against whatever version is currently on disk. There is no tag, so
the version and CHANGELOG guards do not apply — which is why the version and dist-tag are printed
to the summary, so a wrong one is visible before it matters.

**Run one before every real release and read it.** A previous green run is not evidence about this
commit: the sibling project's release workflow was green by construction for months and failed the
first time it was actually executed.

## What the workflow checks before it will publish

In order, all of it before `npm publish`:

- `npm run typecheck`, `npm test`, `npm run build`
- **data-snapshot verification** — `scripts/verify-snapshots.sh`, then the two-stage generated
  chain (`mji.00602.xlsx` → `mji-list.tsv` → `src/generated/tables.ts`). The bundled data is the
  whole point of the package, so a release that skipped this would ship tables nobody checked
  against their source
- `npm pack`, then the full tarball listing into the step summary
- **tarball assertions** — all four entry points (`dist/index.js`, `dist/index.cjs`,
  `dist/index.d.ts`, `dist/index.d.cts`), both licence files, `PROVENANCE.md`, and a size floor on
  the bundle. The size check exists because the MJ tables are *compiled into* the bundle rather
  than shipped as a data file, so presence alone cannot tell a real build from a stub. Measured
  2,512,700 bytes on 2026-08-10; the floor is 2,000,000
- `@arethetypeswrong/cli` on the packed tarball, full strict profile — this package ships both ESM
  and CJS with separate declarations, so all four resolution modes are promises it makes
- **a Node 18 smoke test against the packed tarball**, through both `require()` and `import`. The
  test suite cannot run on Node 18 (the dev toolchain needs 20.12+), so without this the
  `engines: ">=18"` claim would ship unverified

Browser and Cloudflare Workers support is checked by `ci.yml` on every push to `main`, against the
same built bundle from the same commit, rather than duplicated here. Do not release from a commit
whose CI is red.

## What is not covered

- `npm publish` itself, the provenance attestation, and the GitHub Release only happen on a real
  tag push — that is what the release candidate above is for.
- Nothing here checks that the *published* package works. Step 3 of the rc procedure does, by hand.
