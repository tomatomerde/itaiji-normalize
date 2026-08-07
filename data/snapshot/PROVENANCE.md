# Data snapshot provenance

## MJShrinkMap.1.2.0.json

- Title: MJ縮退マップ (MJ Shrink Map) Ver.1.2.0
- Issued: 2018-01-26 (per embedded meta)
- Creator: 独立行政法人情報処理推進機構 (Information-technology Promotion Agency, Japan)
- License: CC BY-SA 2.1 JP (http://creativecommons.org/licenses/by-sa/2.1/jp/)
- Official distribution page: https://moji.or.jp/mojikiban/map/
- Obtained: 2026-08-04, downloaded manually from the official page by the
  repository owner (the CI/agent environment cannot reach moji.or.jp), then
  added to this repository unmodified.
- SHA-256: 275b57ecd5929edb822c05a7e4326980b7028466384afe323ed7209f48acd8cd
- SHA-256 confirmed 2026-08-05 against the repository owner's own copy of the
  download (see "What the hash check does and does not establish" below).
- Corresponds to: MJ文字情報一覧表 Ver.005.02 (per embedded meta)

This snapshot is kept in-repo so builds never fetch from the network.

## mji.00602.xlsx

- Title: MJ文字情報一覧表 (MJ Character Information List) Ver.006.02
- Creator: 文字情報技術促進協議会 / IPA
- License: CC BY-SA 2.1 JP
- Official distribution page: https://moji.or.jp/mojikiban/mjlist/
- Obtained: 2026-08-04, downloaded manually from the official page by the
  repository owner (the agent environment cannot reach moji.or.jp), then
  added to this repository unmodified.
- SHA-256: f79075bf006b66c5e57a6df60503c5a01679cabbcea2f124eb3758593cf6fd3f
- SHA-256 confirmed 2026-08-05 against the repository owner's own copy of the
  download (see "What the hash check does and does not establish" below).
- Role: supplies the UCS / IVS / SVS code points for each MJ glyph name.
  The shrink map identifies source characters only by MJ glyph name, so this
  list is required to key the conversion tables by Unicode input.
- Version note: MJShrinkMap 1.2.0 was built against MJ文字情報一覧表
  Ver.005.02. MJ glyph names are stable identifiers across versions, so the
  newer Ver.006.02 is used for code point resolution (3 of 58,862 rows lack
  対応するUCS in this version).

## What the hash check does and does not establish

Both files reached this repository by hand: the environment that built it
cannot reach moji.or.jp, so the owner downloaded them and uploaded them here.
That path had never been checked, so on 2026-08-05 the owner hashed their own
copies and the values matched the ones recorded above exactly.

That confirms the **transfer**: the bytes committed here are the bytes that
were on the owner's machine, so nothing was truncated or altered in upload.

It does not independently re-verify the **source**. The chain still rests on
the owner having obtained those files from the official pages listed above on
2026-08-04, and a re-download today would only re-confirm what the site serves
now — which is a different claim from what it served then. Anyone who needs
the stronger property should download afresh and run:

    ./scripts/verify-snapshots.sh <download-dir>

A mismatch there is more likely to mean the distribution advanced to a new
version than that these bytes are wrong; check the embedded version first
(`meta.owl:versionInfo` is 1.2.0, built against MJ文字情報一覧表 Ver.005.02).

`scripts/verify-snapshots.sh` with no argument re-checks the committed files
against the hashes above, and runs in CI on every push.
