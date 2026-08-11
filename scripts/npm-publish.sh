#!/usr/bin/env bash
#
# Publish one packed tarball to npm, turning npm's two most likely rejections
# into messages that say what to change.
#
# Usage: scripts/npm-publish.sh <package-name> <dist-tag> <tarball>
#
# Why this exists as a script rather than inline in release.yml: both publish
# steps need identical behaviour, and each `run:` block is its own shell, so
# inlining means two copies that can drift. release.yml already carried a
# comment asking that the two steps be kept in agreement — this makes that
# structural instead of aspirational.
#
# There is no --provenance flag here on purpose. Publishing happens through
# npm trusted publishing (OIDC), and npm generates the provenance attestation
# automatically on that path — the docs are explicit that the flag is not
# needed. Adding it back would be, at best, redundant.
#
# --access public stays. For a name the registry does not know yet, npm
# refuses to mint an attestation unless access is stated explicitly:
#
#   npm error code EUSAGE
#   npm error Can't generate provenance for new or private package, you must
#   set `access` to public.
#
# An unscoped package is public by default, so the flag looks redundant —
# and npm still rejects it, because "default" is not "explicitly public".
# A sibling package survived the first release only because its
# package.json happened to carry publishConfig.access; two others without
# it failed on their first real tag push (2026-08-10).
#
# The exit code of `npm publish` is always preserved. The diagnostics only add
# an explanation; they never turn a failure into a success.

set -euo pipefail

package="${1:?package name required}"
dist_tag="${2:?dist-tag required}"
tarball="${3:?tarball path required}"

log="${RUNNER_TEMP:-/tmp}/npm-publish-${package}.log"

# Output goes to a file rather than a pipe. Piping into `tee`/`grep` here
# would put a second command's exit status in play under `pipefail`, and the
# whole point is to report npm's own status faithfully.
set +e
npm publish --access public --tag "$dist_tag" "$tarball" > "$log" 2>&1
status=$?
set -e

cat "$log"

if [ "$status" -eq 0 ]; then
  exit 0
fi

# EOTP: npm asked for a one-time password, which means 2FA still applies to
# this token. On npm's current token page — where classic and granular token
# creation have been merged into one form — the deciding field is the
# "Bypass two-factor authentication (2FA)" checkbox under General. A token
# created without it ticked is rejected from CI every time, no matter what
# its package permissions say. This is not something a dry run can ever
# surface, because dry runs never reach `npm publish`.
if grep -q 'EOTP' "$log"; then
  echo "::error::npm rejected the publish of ${package} with EOTP (one-time password required). This means the publish authenticated with a token rather than through trusted publishing (OIDC) -- the OIDC path never asks for an OTP -- so this run is on the NPM_TOKEN rollback path, and that token was created without the \"Bypass two-factor authentication (2FA)\" checkbox ticked. Create a new token at https://www.npmjs.com/settings/~/tokens with that box ticked and Packages and scopes: Read and write, update the NPM_TOKEN secret, and re-run. Regenerating the existing token does NOT change this setting. See docs/releasing.md 'One-time setup'." >&2
elif grep -q 'EUSAGE' "$log" && grep -q 'provenance' "$log"; then
  echo "::error::npm refused to publish ${package} because provenance requires an explicit public access setting. The publish command already passes --access public, so if you are seeing this, that flag was removed or overridden — check scripts/npm-publish.sh and package.json's publishConfig. See docs/releasing.md 'Provenance'." >&2
elif grep -qiE 'ENEEDAUTH|E401|401 Unauthorized|Unable to authenticate' "$log"; then
  echo "::error::npm could not authenticate publishing ${package}. This workflow uses trusted publishing (OIDC) and carries no token, so check: the job has id-token: write; npm is >= 11.5.1 (the step near the top asserts this); and npmjs.com lists a trusted publisher for ${package} pointing at this repository and .github/workflows/release.yml with an empty Environment name. See docs/releasing.md 'Trusted publishing'." >&2
elif grep -qE 'E403|403 Forbidden' "$log"; then
  echo "::error::npm returned 403 publishing ${package}. Either the token lacks write access to this package, or the name is taken by someone else. Note that a Granular Access Token scoped to specific packages cannot publish a name that does not exist yet — the first publish of a new name needs a token scoped to all packages. See docs/releasing.md 'One-time setup'." >&2
fi

exit "$status"
