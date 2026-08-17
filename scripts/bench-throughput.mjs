#!/usr/bin/env node
// スループットを測る。README の「Throughput」段落の唯一の出どころ。
//
// **CI では判定しない。** 機械依存の数値を赤/緑の条件にするとフレークになり、
// 「また赤い」で読まれない検査が1つ増えるだけになる。ここでやるのは
// 「読者が自分の機械で測り直せるようにする」ことで、数値そのものは
// 測定条件(機械・Node・データ)と必ずセットで出す。
//
// 使い方(先に `npm run build` が要る):
//   npm run bench
//   npm run bench -- --json
//   npm run bench -- --names 200000 --runs 10
//
// **ビルドの直後に走らせないこと。** `npm run build && npm run bench` のように
// 繋ぐと、マシンがまだ忙しいうちに測ることになる——実際それで中央値が
// 227ms から 263ms まで落ちた。bench にビルドを含めていないのはこのため。

import { cpus, totalmem } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// src/ ではなく dist/ を測る。利用者が実際に走らせるのはビルド後のバンドルで、
// README の数値もそちら側の話だから。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = path.join(root, "dist", "index.js");
if (!existsSync(distEntry)) {
  console.error("dist/index.js が無い。先に `npm run build` を実行すること。");
  process.exit(1);
}
const { toMatchingKey } = await import(distEntry);

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};

const NAME_COUNT = flag("names", 100_000);
const RUNS = flag("runs", 7);
const WARMUP = flag("warmup", 2);

/**
 * 日本語の姓名らしい短い文字列を生成する。
 *
 * 実データではなく合成データなのは、そのほうが再現できるから——固定の姓・名を
 * 決定的に組み合わせるので、誰がいつ走らせても同じ入力になる。異体字を
 * 含む姓を意図的に混ぜてある(渡邉・髙橋・﨑山など)。全部が畳める字だと
 * 実際より速く出るし、全部が畳めない字だと遅く出るので、README の
 * 「短い名前」という条件に合う程度に混ぜてある。
 */
function makeNames(count) {
  const surnames = [
    "渡邉", "渡邊", "渡辺", "髙橋", "高橋", "﨑山", "崎山", "齋藤", "斎藤", "佐藤",
    "鈴木", "田中", "山本", "中村", "小林", "吉田", "山田", "𠮷田", "松本", "井上",
  ];
  const givens = [
    "太郎", "花子", "一郎", "美咲", "健太", "彩", "翔", "結衣", "大輔", "真理",
  ];
  const names = new Array(count);
  for (let i = 0; i < count; i++) {
    // 姓と名で異なる素数刻みにして、20x10 の組み合わせを一周で使い切る。
    names[i] = surnames[i % surnames.length] + givens[(i * 3) % givens.length];
  }
  return names;
}

function runOnce(names) {
  const start = process.hrtime.bigint();
  // 結果を捨てるだけだと最適化で消える可能性があるので、長さを足し込んで残す。
  let sink = 0;
  for (let i = 0; i < names.length; i++) sink += toMatchingKey(names[i]).key.length;
  const end = process.hrtime.bigint();
  return { ms: Number(end - start) / 1e6, sink };
}

const names = makeNames(NAME_COUNT);

for (let i = 0; i < WARMUP; i++) runOnce(names);

const samples = [];
for (let i = 0; i < RUNS; i++) samples.push(runOnce(names).ms);
samples.sort((a, b) => a - b);

const min = samples[0];
const max = samples[samples.length - 1];
const median = samples[Math.floor(samples.length / 2)];

const report = {
  // 測定条件。数値だけを引用されないよう、必ず一緒に出す。
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: cpus()[0]?.model ?? "unknown",
  cpuCount: cpus().length,
  totalMemGB: Math.round(totalmem() / 1024 ** 3),
  library: "itaiji-normalize",
  names: NAME_COUNT,
  runs: RUNS,
  warmup: WARMUP,
  msMin: Number(min.toFixed(1)),
  msMedian: Number(median.toFixed(1)),
  msMax: Number(max.toFixed(1)),
  callsPerSecMedian: Math.round(NAME_COUNT / (median / 1000)),
  samplesMs: samples.map((s) => Number(s.toFixed(1))),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${NAME_COUNT.toLocaleString("en-US")} 件の toMatchingKey / ${RUNS} 回試行(ウォームアップ ${WARMUP} 回)`);
  console.log("");
  console.log(`  中央値   ${report.msMedian} ms  (${(report.callsPerSecMedian / 1e6).toFixed(2)} M calls/sec)`);
  console.log(`  最小-最大 ${report.msMin} - ${report.msMax} ms`);
  console.log("");
  console.log("測定条件(数値だけを引用しないこと):");
  console.log(`  Node     ${report.node}`);
  console.log(`  CPU      ${report.cpu} x${report.cpuCount}`);
  console.log(`  Platform ${report.platform}, RAM ${report.totalMemGB} GB`);
}
