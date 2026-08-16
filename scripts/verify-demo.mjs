/**
 * Serves the built demo (demo/_site) and drives it in a real browser.
 *
 * The page makes two promises to visitors that only a real engine can check:
 *
 *   1. "何も打たなくても結果が見える" — results, including a failure case,
 *      must be on screen before anyone types.
 *   2. "その後は何を入力してもリクエストは発生しません" — after the bundle
 *      has loaded, no interaction may produce a network request. That claim is
 *      the whole point of a client-side demo for this library, so it is
 *      asserted rather than assumed: the request listener is attached once the
 *      page reports itself ready, and every preset button and both inputs are
 *      then exercised.
 *
 * Run: npm run test:demo   (after ./demo/build.sh)
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

/** Mirrors scripts/verify-browser.mjs — some sandboxes ship a fixed Chromium. */
function resolveExecutablePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const preinstalled = "/opt/pw-browsers/chromium";
  if (existsSync(preinstalled)) return preinstalled;
  return undefined;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(root, "demo/_site");
const PINNED = (await readFile(path.join(root, "demo/pinned-version.txt"), "utf8")).trim();

if (!existsSync(path.join(SITE, "index.html"))) {
  console.error(`no built demo at ${SITE} — run ./demo/build.sh first`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    // Resolve under SITE and reject anything that escapes it.
    const file = path.join(SITE, path.normalize(rel));
    if (!file.startsWith(SITE)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const executablePath = resolveExecutablePath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let failure = null;

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const loadRequests = [];
  const recordLoad = (r) => loadRequests.push(r.url());
  page.on("request", recordLoad);

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForSelector("body[data-ready='1']", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  page.off("request", recordLoad);

  assert.deepEqual(pageErrors, [], "uncaught page errors during load");

  // Whatever the page fetched to boot must be its own origin only. A demo
  // that phones out while claiming otherwise is worse than no demo.
  const foreign = loadRequests.filter((u) => !u.startsWith(`http://127.0.0.1:${port}/`));
  assert.deepEqual(foreign, [], "the page requested a third-party origin during load");

  // 1. Results are on screen without anyone typing.
  const groupCount = await page.locator("#text-output .group").count();
  assert.ok(groupCount >= 2, `expected the default input to form several groups, got ${groupCount}`);

  const watanabe = page.locator("#text-output .group").first();
  assert.equal((await watanabe.locator(".glyph-key").first().textContent()).trim(), "渡辺 太郎");
  assert.equal(await watanabe.locator(".members > li").count(), 3, "渡邉/渡邊/渡辺 should share one key");

  // 2. A failure case is visible without interaction — this library's whole
  //    argument is that it refuses to guess, so a demo showing only successes
  //    would misrepresent it.
  const reasons = await page.locator("#text-output .unresolved .reason").allTextContents();
  assert.ok(reasons.includes("ambiguous"), `expected an ambiguous case on load, got ${JSON.stringify(reasons)}`);

  // The default sample contains 𠮷田 功 and 吉田 功 — same key, but 功 sits at a
  // different offset in each because 𠮷 is a surrogate pair. Both offsets must
  // be reported (a per-group instead of per-line result would show only one),
  // and they must be labelled as UTF-16 code units rather than as an ordinal
  // character count, which is what the surrogate pair makes wrong.
  const offsets = await page.locator("#text-output .unresolved .where").allTextContents();
  assert.ok(
    offsets.some((t) => t.includes("オフセット 4（UTF-16")) && offsets.some((t) => t.includes("オフセット 3（UTF-16")),
    `expected per-line UTF-16 offsets 4 and 3, got ${JSON.stringify(offsets)}`,
  );

  // 3. The single-character panel rendered its default too.
  assert.equal((await page.locator("#char-output .glyph-big").textContent()).trim(), "﨑");
  assert.equal((await page.locator("#char-output .via").textContent()).trim(), "base");
  assert.equal((await page.locator("#char-output .unique .glyph-key").textContent()).trim(), "崎");

  // 4. The pinned version is what the page advertises.
  const versionText = await page.locator(".version").textContent();
  assert.equal(versionText.trim(), `v${PINNED}`);
  assert.ok(
    (await page.locator("body").textContent()).includes(`itaiji-normalize@${PINNED}`),
    "the install command should name the pinned version",
  );

  // 5. Zero requests from here on. Start listening only now: the bundle load
  //    above is a request, and it is the one the page tells visitors about.
  const afterReady = [];
  page.on("request", (r) => afterReady.push(`${r.method()} ${r.url()}`));

  await page.fill("#text-input", "渡邉\n渡邊\n㍿ 髙島屋\n龟");
  await page.fill("#char-input", "傳\u{E0102}");

  const presets = page.locator(".preset");
  const presetCount = await presets.count();
  assert.ok(presetCount >= 8, `expected the preset buttons to exist, got ${presetCount}`);
  for (let i = 0; i < presetCount; i++) await presets.nth(i).click();

  // Give anything asynchronous a chance to fire before declaring silence.
  await page.waitForTimeout(1500);

  assert.deepEqual(afterReady, [], "the page made network requests after loading");
  assert.deepEqual(pageErrors, [], "uncaught page errors during interaction");

  // 6. The presets really do demonstrate what they claim. Re-select the ones
  //    that carry the argument and check the rendered result, so a preset that
  //    silently stops being ambiguous (a data update, say) fails here.
  const checks = [
    { preset: "朢", expectUnique: null },
    { preset: "傳 + IVS", expectVia: "ivs" },
    // resolvedVia "base" reads differently depending on whether the input
    // carried a selector, and only one of the two readings is a fallback.
    // Both wordings are asserted so the distinction cannot quietly collapse.
    { preset: "葛 + IVS", expectVia: "base", expectViaText: /フォールバック/ },
    { preset: "﨑", expectVia: "base", expectViaText: /^基底文字の項目で解決した$/ },
    { preset: "龟", expectUnique: null, expectCandidates: 0 },
  ];
  for (const check of checks) {
    await page.locator(".preset", { hasText: check.preset }).first().click();
    if (check.expectUnique === null) {
      await page.waitForSelector("#char-output .unique-null .null-literal");
    }
    if (check.expectVia) {
      assert.equal(
        (await page.locator("#char-output .via").textContent()).trim(),
        check.expectVia,
        `preset ${check.preset}`,
      );
    }
    if (check.expectViaText) {
      const text = (await page.locator("#char-output .char-via .reason-text").textContent()).trim();
      assert.match(text, check.expectViaText, `preset ${check.preset}`);
    }
    if (check.expectCandidates === 0) {
      assert.equal(await page.locator("#char-output .candidates > li").count(), 0, `preset ${check.preset}`);
    }
  }

  assert.deepEqual(afterReady, [], "the page made network requests while exercising presets");

  console.log(
    `demo check OK — ${await browser.version()}; ` +
      `${loadRequests.length} request(s) to load the page, 0 after`,
  );
} catch (err) {
  failure = err;
} finally {
  await browser.close();
  server.close();
}

if (failure) {
  console.error(failure);
  process.exit(1);
}
