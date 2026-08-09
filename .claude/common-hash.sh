#!/usr/bin/env bash
# Print the SHA-256 of the dev-standards common section inside a CLAUDE.md.
#
# This file is distributed to every project repository as .claude/common-hash.sh
# and is the ONLY definition of "what gets hashed". The sync script in
# dev-standards and the integrity check in each project both call it, so the
# two can never disagree about the extraction. Do not reimplement the sed
# pipeline anywhere else.
#
# Hashed region: the lines strictly between the BEGIN and END markers. The
# provenance comment that records which dev-standards revision produced the
# block sits ABOVE the BEGIN marker on purpose, so bumping it does not change
# the hash.
#
# Usage: common-hash.sh [path/to/CLAUDE.md]     (default: ./CLAUDE.md)
# Exit 2 if the markers are missing or malformed — a silent empty hash would
# make a CLAUDE.md with no common section look valid.

set -euo pipefail

BEGIN_MARKER='<!-- BEGIN dev-standards common -->'
END_MARKER='<!-- END dev-standards common -->'

target="${1:-CLAUDE.md}"

if [ ! -f "$target" ]; then
  echo "common-hash: no such file: $target" >&2
  exit 2
fi

begin_count=$(grep -c -F -x "$BEGIN_MARKER" "$target" || true)
end_count=$(grep -c -F -x "$END_MARKER" "$target" || true)

if [ "$begin_count" -ne 1 ] || [ "$end_count" -ne 1 ]; then
  echo "common-hash: expected exactly one BEGIN and one END marker in $target" >&2
  echo "common-hash: found BEGIN=$begin_count END=$end_count" >&2
  exit 2
fi

begin_line=$(grep -n -F -x "$BEGIN_MARKER" "$target" | cut -d: -f1)
end_line=$(grep -n -F -x "$END_MARKER" "$target" | cut -d: -f1)

if [ "$end_line" -le "$begin_line" ]; then
  echo "common-hash: END marker precedes BEGIN marker in $target" >&2
  exit 2
fi

# Lines strictly between the markers. sed ranges are inclusive, so trim both ends.
sed -n "${begin_line},${end_line}p" "$target" | sed '1d;$d' | sha256sum | cut -d' ' -f1
