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
- Role: supplies the UCS / IVS / SVS code points for each MJ glyph name.
  The shrink map identifies source characters only by MJ glyph name, so this
  list is required to key the conversion tables by Unicode input.
- Version note: MJShrinkMap 1.2.0 was built against MJ文字情報一覧表
  Ver.005.02. MJ glyph names are stable identifiers across versions, so the
  newer Ver.006.02 is used for code point resolution (3 of 58,862 rows lack
  対応するUCS in this version).
