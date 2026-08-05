/**
 * Runs the built ESM bundle in a real browser and asserts the public API
 * behaves there.
 *
 * The package advertises browser support, and until this script existed that
 * claim rested on "it has no dependencies, so it probably works" — which is
 * exactly the kind of unverified assumption this project treats as a defect.
 * Two things can only be checked in a real engine: that the bundle touches no
 * Node built-in, and that String.prototype.normalize (which needs full ICU)
 * behaves the same way the Node-based tests assume.
 *
 * Run: npm run test:browser
 * Requires a Chromium build — see resolveExecutablePath below for how one is
 * found.
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

/**
 * Playwright normally resolves the Chromium build matching its own version.
 * Some sandboxes ship a preinstalled Chromium at a fixed path whose revision
 * does not match, in which case Playwright's resolution fails outright — so
 * prefer an explicitly provided or preinstalled binary, and only fall back to
 * Playwright's own lookup (which is what CI uses after `playwright install`).
 */
function resolveExecutablePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const preinstalled = "/opt/pw-browsers/chromium";
  if (existsSync(preinstalled)) return preinstalled;
  return undefined;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = path.join(root, "dist/index.js");

const PAGE = `<!doctype html><meta charset="utf-8"><title>mj-shrink-map browser check</title>
<body><pre id="out">running</pre>
<script type="module">
  import { reduce, isVariant, getVariants, toMatchingKey } from "./index.js";
  const results = {};
  try {
    results.reduceUnique      = reduce("\\uFA11").unique;                 // 﨑 -> 崎
    results.reduceResolvedVia = reduce("\\uFA11").resolvedVia;
    results.reduceBasis       = reduce("\\uFA11").candidates[0].basis[0];
    results.isVariant         = isVariant("\\uFA11", "\\u5D0E");
    results.isVariantFalse    = isVariant("\\u5D0E", "\\u9AD8");
    results.variantCount      = getVariants("\\u5D0E").length;
    results.matchingKey       = toMatchingKey("\\u7530\\u4E2D\\uFA11").key;  // 田中﨑 -> 田中崎
    results.multiHop          = toMatchingKey("\\u3550").key;               // 㕐 -> 冩 -> 写
    results.unresolvedEmpty   = toMatchingKey("\\uFA11\\u7530").unresolved.length;
    results.cycleReason       = toMatchingKey("\\u5740").unresolved[0].reason; // 址
    results.noCandidate       = toMatchingKey("\\u9F9F").unresolved[0].reason; // 龟
    // NFKC needs full ICU; if the engine lacks it these silently differ.
    results.nfkcCompat        = toMatchingKey("\\u3231").key;              // ㈱ -> (株)
    results.nfkcCircled       = toMatchingKey("\\u2460\\u2461").key;       // ①② -> 12
    results.fe0fPreserved     = toMatchingKey("\\u3297\\uFE0F").key.endsWith("\\uFE0F");
    results.rejectsNonString  = (() => { try { reduce(["x"]); return false; } catch { return true; } })();
    results.rejectsBadMode    = (() => { try { toMatchingKey("\\u5D0E", {unicodeNormalize:"NFKD"}); return false; } catch { return true; } })();
    results.ok = true;
  } catch (e) {
    results.ok = false;
    results.error = String(e && e.stack || e);
  }
  document.getElementById("out").textContent = JSON.stringify(results);
</script>`;

const server = createServer(async (req, res) => {
  try {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    if (req.url === "/index.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(await readFile(BUNDLE));
      return;
    }
    res.writeHead(404).end("not found");
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const executablePath = resolveExecutablePath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let failure = null;
try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  // Read the result out of the DOM rather than trusting console output —
  // a page that failed to execute at all would print nothing and look quiet.
  const raw = await page.textContent("#out");
  assert.notEqual(raw, "running", "the module script never ran");
  const r = JSON.parse(raw);
  assert.equal(r.ok, true, `page threw: ${r.error}`);
  assert.deepEqual(consoleErrors, [], "uncaught page errors");

  assert.equal(r.reduceUnique, "崎");
  assert.equal(r.reduceResolvedVia, "base");
  assert.equal(r.reduceBasis, "family-register-notice");
  assert.equal(r.isVariant, true);
  assert.equal(r.isVariantFalse, false);
  assert.ok(r.variantCount > 0, "getVariants returned nothing");
  assert.equal(r.matchingKey, "田中崎");
  assert.equal(r.multiHop, "写");
  assert.equal(r.unresolvedEmpty, 0);
  assert.equal(r.cycleReason, "cycle");
  assert.equal(r.noCandidate, "no-candidate");
  assert.equal(r.nfkcCompat, "(株)", "NFKC did not fold — engine may lack full ICU");
  assert.equal(r.nfkcCircled, "12");
  assert.equal(r.fe0fPreserved, true);
  assert.equal(r.rejectsNonString, true);
  assert.equal(r.rejectsBadMode, true);

  console.log(`browser check OK — ${await browser.version()}`);
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
