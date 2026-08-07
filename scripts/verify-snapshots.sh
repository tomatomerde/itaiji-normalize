#!/usr/bin/env bash
#
# Verifies the committed data snapshots against the SHA-256 values recorded in
# data/snapshot/PROVENANCE.md.
#
# Usage:
#   scripts/verify-snapshots.sh              # check the committed snapshots
#   scripts/verify-snapshots.sh <dir>        # check freshly downloaded copies
#                                            # in <dir> against the same values
#
# The second form is the one a human uses to close the open provenance
# question: this environment cannot reach moji.or.jp, so the snapshots were
# added from a manual download and have never been compared against the
# official distribution. Download them again and point this script at the
# directory; identical hashes mean the committed bytes are the published ones.
#
# The hashes live in PROVENANCE.md rather than in this script on purpose:
# PROVENANCE.md is the document a reader consults, and a second copy would be
# free to drift from it.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
provenance="$root/data/snapshot/PROVENANCE.md"
dir="${1:-$root/data/snapshot}"

if [ ! -f "$provenance" ]; then
  echo "error: $provenance not found" >&2
  exit 2
fi

# PROVENANCE.md records each file as "## <filename>" followed by a
# "- SHA-256: <hex>" line. Pair them up in document order.
#
# Only a heading that is exactly "## <one-word>" starts a file section. Prose
# headings ("## What the hash check does and does not establish") must clear
# the pending name instead of contributing "What" as a filename, or a later
# hash line in such a section would be paired with it and reported MISSING.
mapfile -t pairs < <(
  awk '
    /^## / { name = (NF == 2 ? $2 : ""); next }
    /^- SHA-256:/ && name != "" { print name "\t" $3; name = "" }
  ' "$provenance"
)

if [ "${#pairs[@]}" -eq 0 ]; then
  echo "error: no '## <file>' + '- SHA-256:' pairs found in $provenance" >&2
  exit 2
fi

status=0
checked=0
for pair in "${pairs[@]}"; do
  name="${pair%%$'\t'*}"
  expected="${pair##*$'\t'}"
  file="$dir/$name"
  if [ ! -f "$file" ]; then
    echo "MISSING  $name (looked in $dir)"
    status=1
    continue
  fi
  actual="$(sha256sum "$file" | cut -d' ' -f1)"
  if [ "$actual" = "$expected" ]; then
    echo "OK       $name"
  else
    echo "MISMATCH $name"
    echo "         expected $expected (per PROVENANCE.md)"
    echo "         actual   $actual"
    status=1
  fi
  checked=$((checked + 1))
done

if [ "$status" -eq 0 ]; then
  echo "All $checked snapshot(s) match the hashes recorded in PROVENANCE.md."
else
  echo "Snapshot verification FAILED." >&2
fi
exit "$status"
