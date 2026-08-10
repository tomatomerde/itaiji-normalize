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
npm publish --provenance --tag "$dist_tag" "$tarball" > "$log" 2>&1
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
  echo "::error::npm rejected the publish of ${package} with EOTP (one-time password required). NPM_TOKEN was created without the \"Bypass two-factor authentication (2FA)\" checkbox ticked, so npm demands an OTP that CI cannot supply. Create a new token at https://www.npmjs.com/settings/~/tokens with that box ticked and Packages and scopes: Read and write, update the NPM_TOKEN secret, and re-run. Regenerating the existing token does NOT change this setting. See docs/releasing.md 'One-time setup'." >&2
elif grep -qE 'E403|403 Forbidden' "$log"; then
  echo "::error::npm returned 403 publishing ${package}. Either the token lacks write access to this package, or the name is taken by someone else. Note that a Granular Access Token scoped to specific packages cannot publish a name that does not exist yet — the first publish of a new name needs a token scoped to all packages. See docs/releasing.md 'One-time setup'." >&2
fi

exit "$status"
