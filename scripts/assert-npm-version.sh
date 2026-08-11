#!/usr/bin/env bash
#
# Fail unless the npm currently on PATH is new enough to publish through npm
# trusted publishing (OIDC).
#
# Usage: scripts/assert-npm-version.sh <context>
#
# Trusted publishing requires npm >= 11.5.1. The npm bundled with the Node 22
# runner is older than that (10.9.8, measured 2026-08-10), and when it is too
# old the run fails at the very end with an authentication error that says
# nothing about versions -- so this turns that into an early, legible failure.
#
# It runs twice in the release workflow, and the second call is the one that
# earns its keep: `actions/setup-node` runs again after the smoke test on the
# oldest supported runtime, and re-running it can put the Node-bundled npm back
# on PATH over the global upgrade done at the top of the job. Checking only
# before that downgrade would prove nothing about the npm that actually
# publishes.
#
# A script rather than two inline copies: each `run:` block is its own shell,
# so inlining means two copies that can drift -- the same reason
# npm-publish.sh exists.

set -euo pipefail

context="${1:?context required, e.g. 'after install' or 'immediately before publish'}"
need="11.5.1"
have="$(npm --version)"

echo "npm $have ($context)"

node -e '
  const [have, need, context] = process.argv.slice(1);
  const cmp = (a, b) => {
    const pa = a.split("-")[0].split(".").map(Number);
    const pb = b.split("-")[0].split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  };
  if (cmp(have, need) < 0) {
    console.error(`::error::npm ${have} is too old for trusted publishing (checked ${context}); ${need} or later is required. The job upgrades npm globally near the top; a later actions/setup-node step can put the Node-bundled npm back on PATH, so re-run "npm install -g npm@latest" after it.`);
    process.exit(1);
  }
' "$have" "$need" "$context"
