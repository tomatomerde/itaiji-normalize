#!/usr/bin/env bash
#
# Assembles the demo site into an output directory (default: demo/_site).
#
# The demo deliberately runs the *published* package rather than a build of
# the working tree: a visitor who runs `npm install itaiji-normalize` must get
# the behaviour they just saw on the page. So the bundle is fetched from the
# registry at the version pinned in demo/pinned-version.txt, and that version
# is stamped into the page.
#
# Run: ./demo/build.sh [outdir]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="${1:-$here/_site}"
version="$(tr -d '[:space:]' < "$here/pinned-version.txt")"

if [ -z "$version" ]; then
  echo "demo/pinned-version.txt is empty" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "fetching itaiji-normalize@$version from the registry"
# npm pack does not create its destination directory (npm/cli#4351), and the
# release workflow was once broken by exactly that. Create it first.
mkdir -p "$work/tgz"
npm pack "itaiji-normalize@$version" --pack-destination "$work/tgz" > /dev/null

tarball="$work/tgz/itaiji-normalize-$version.tgz"
if [ ! -f "$tarball" ]; then
  echo "expected $tarball to exist after npm pack; got:" >&2
  ls -la "$work/tgz" >&2
  exit 1
fi

mkdir -p "$work/x"
tar -xzf "$tarball" -C "$work/x"

# Guard against silently shipping a page with no library in it. Checked with
# `test -f` rather than `tar -tzf | grep -q`: under `set -o pipefail` a
# short-circuiting reader kills the writer with SIGPIPE and fails the
# pipeline exactly when the pattern *does* match.
bundle="$work/x/package/dist/index.js"
for required in "$bundle" "$work/x/package/LICENSE" "$work/x/package/LICENSE-DATA" \
                "$work/x/package/data/snapshot/PROVENANCE.md"; do
  if [ ! -f "$required" ]; then
    echo "missing from the published tarball: $required" >&2
    exit 1
  fi
done

# Verify the tarball really is the version we asked for, rather than trusting
# the filename npm chose.
packed_version="$(node -p "require('$work/x/package/package.json').version")"
if [ "$packed_version" != "$version" ]; then
  echo "tarball declares version $packed_version, expected $version" >&2
  exit 1
fi

# Measured, not remembered: the page states this number, so recompute it on
# every build instead of letting a hand-written figure drift.
gzip_kb="$(gzip -9 -c "$bundle" | wc -c | awk '{printf "%.0f", $1/1024}')"

rm -rf "$out"
mkdir -p "$out/vendor"
cp "$bundle" "$out/vendor/itaiji-normalize.js"
cp "$work/x/package/LICENSE" "$out/vendor/LICENSE.txt"
cp "$work/x/package/LICENSE-DATA" "$out/vendor/LICENSE-DATA.txt"
cp "$work/x/package/data/snapshot/PROVENANCE.md" "$out/vendor/PROVENANCE.md"

# Pages would otherwise run the output through Jekyll, which drops files and
# directories beginning with an underscore.
touch "$out/.nojekyll"

for file in index.html app.js style.css; do
  sed -e "s/__ITAIJI_VERSION__/$version/g" \
      -e "s/__BUNDLE_GZIP_KB__/$gzip_kb/g" \
      "$here/$file" > "$out/$file"
done

# A stale pin is the one way this page can quietly start lying, so say so
# loudly at build time rather than discovering it from a bug report.
latest="$(npm view itaiji-normalize version 2>/dev/null || true)"
if [ -n "$latest" ] && [ "$latest" != "$version" ]; then
  echo "::warning::demo/pinned-version.txt pins $version but the registry's latest is $latest — bump the pin"
  echo "WARNING: pinned $version, registry latest $latest" >&2
fi

echo "built $out (itaiji-normalize $version, bundle ${gzip_kb}KB gzipped)"
