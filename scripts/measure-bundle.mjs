#!/usr/bin/env node
// バンドルサイズを測る。README の「Bundle size」表の唯一の出どころ。
//
// この表の数値は長らく手元で1回測っただけのもので、どの esbuild で測ったかが
// 記録に無かった。2026-08-17 に測り直したら 4〜13 KB 下振れしていて、それが
// バンドラの版差なのかライブラリ側の変化なのか判定できなかった——数値が
// 間違っていたことではなく、測り直せなかったことが問題だったので、
// 手順のほうをリポジトリに置く。
//
// 使い方:
//   node scripts/measure-bundle.mjs            # 人が読む表
//   node scripts/measure-bundle.mjs --json     # 機械が読む JSON
//   node scripts/measure-bundle.mjs --check    # 基準値と比べて許容幅を外れたら異常終了
//
// esbuild は devDependency として**厳密指定**で入れてある(package.json の
// devDependencies を参照)。版が記録に無かったことが今回の原因そのものなので、
// キャレットを付けないこと。

import { gzipSync } from "node:zlib";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(ROOT, "docs", "measurements", "bundle-size.json");

// README の表と同じ4行。名前は README の「what you import」列と揃えること。
const ENTRIES = [
  { id: "isVariant", label: "`isVariant` only", source: `export { isVariant } from "SRC";` },
  { id: "reduce", label: "`reduce` only", source: `export { reduce } from "SRC";` },
  { id: "toMatchingKey", label: "`toMatchingKey`", source: `export { toMatchingKey } from "SRC";` },
  { id: "all", label: "the whole API", source: `export * from "SRC";` },
];

/**
 * 1エントリぶんを minify + gzip して、gzip 後のバイト数を返す。
 *
 * src/index.ts をそのまま入口にすると tree-shaking が効かず全部入りになるので、
 * 「その関数だけを再輸出する小さなファイル」を作って、そこを入口にする。
 * これは利用者が `import { reduce } from "itaiji-normalize"` と書いたときに
 * バンドラがやることと同じ。
 */
async function measure(entry, tmp) {
  const entryPath = join(tmp, `${entry.id}.ts`);
  writeFileSync(entryPath, entry.source.replace("SRC", join(ROOT, "src", "index.ts")));

  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });

  const [out] = result.outputFiles;
  return {
    id: entry.id,
    label: entry.label,
    minifiedBytes: out.contents.byteLength,
    gzipBytes: gzipSync(out.contents, { level: 9 }).byteLength,
  };
}

function kb(bytes) {
  return Math.round(bytes / 1024);
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const check = args.includes("--check");

  const tmp = mkdtempSync(join(tmpdir(), "itaiji-bundle-"));
  let measurements;
  try {
    measurements = [];
    for (const entry of ENTRIES) measurements.push(await measure(entry, tmp));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const report = {
    // 測定条件。この3つが記録に無かったのが今回の問題なので、常に一緒に出す。
    esbuild: require("esbuild/package.json").version,
    library: require(join(ROOT, "package.json")).version,
    node: process.version,
    measurements,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`itaiji-normalize ${report.library} / esbuild ${report.esbuild} / Node ${report.node}`);
    console.log("");
    console.log("| what you import | gzip | minified |");
    console.log("| --- | --- | --- |");
    for (const m of measurements) {
      console.log(`| ${m.label} | ~${kb(m.gzipBytes)} KB | ~${kb(m.minifiedBytes)} KB |`);
    }
  }

  if (check) process.exitCode = runCheck(measurements, asJson) ? 0 : 1;
}

/**
 * 基準値との比較。**完全一致ではなく許容幅**で見る。
 *
 * 厳密一致にすると esbuild を上げるたびに赤くなり、「また赤い」で誰も読まない
 * 検査になる。逆に幅が無いと、テーブルを1つ丸ごと取り込んでしまうような
 * 事故を見逃す。5% は「バンドラの版差では踏まないが、テーブル1枚(数十 KB)なら
 * 確実に踏む」ところに置いてある。
 */
function runCheck(measurements, quiet) {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const tolerance = baseline.tolerance;
  let ok = true;

  for (const m of measurements) {
    const expected = baseline.measurements.find((b) => b.id === m.id);
    if (!expected) {
      console.error(`::error::${m.id} が ${BASELINE_PATH} に無い。基準値を更新すること。`);
      ok = false;
      continue;
    }
    const drift = (m.gzipBytes - expected.gzipBytes) / expected.gzipBytes;
    const pct = (drift * 100).toFixed(1);
    if (Math.abs(drift) > tolerance) {
      console.error(
        `::error::${m.id}: gzip ${m.gzipBytes} B が基準 ${expected.gzipBytes} B から ${pct}% 動いた` +
          `(許容 ±${(tolerance * 100).toFixed(0)}%)。意図した変化なら ` +
          `\`npm run measure:bundle -- --json\` の出力で docs/measurements/bundle-size.json を更新し、` +
          `README の表も一緒に直すこと。`,
      );
      ok = false;
    } else if (!quiet) {
      console.log(`ok  ${m.id}: ${m.gzipBytes} B (基準比 ${drift >= 0 ? "+" : ""}${pct}%)`);
    }
  }

  // 基準側にしか無い行も検出する。README の表から行が消えたのに基準が残る、
  // という片側だけの更新を防ぐため。
  for (const b of baseline.measurements) {
    if (!measurements.some((m) => m.id === b.id)) {
      console.error(`::error::基準値の ${b.id} を測っていない。ENTRIES を確認すること。`);
      ok = false;
    }
  }

  return ok;
}

await main();
