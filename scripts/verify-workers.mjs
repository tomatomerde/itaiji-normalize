/**
 * Runs the built ESM bundle inside workerd — the same runtime Cloudflare
 * Workers uses — and asserts the public API behaves there.
 *
 * The package advertises Cloudflare Workers support. Workers is not Node and
 * not quite a browser: it is a V8 isolate with its own globals, its own
 * module loader, and no Node built-ins. "It has no dependencies so it
 * probably works" is not evidence, and neither is the browser check, so this
 * exercises the real thing. It also confirms NFKC folds correctly there,
 * which depends on the runtime shipping full ICU.
 *
 * Run: npm run test:workers
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.WORKERD_PORT ?? 8791);
const require = createRequire(import.meta.url);

const WORKER = `import { reduce, isVariant, getVariants, toMatchingKey } from "./index.js";
export default {
  fetch() {
    const r = {};
    try {
      r.reduceUnique      = reduce("\\uFA11").unique;
      r.reduceResolvedVia = reduce("\\uFA11").resolvedVia;
      r.reduceBasis       = reduce("\\uFA11").candidates[0].basis[0];
      r.isVariant         = isVariant("\\uFA11", "\\u5D0E");
      r.isVariantFalse    = isVariant("\\u5D0E", "\\u9AD8");
      r.variantCount      = getVariants("\\u5D0E").length;
      r.matchingKey       = toMatchingKey("\\u7530\\u4E2D\\uFA11").key;
      r.multiHop          = toMatchingKey("\\u3550").key;
      r.cycleReason       = toMatchingKey("\\u5740").unresolved[0].reason;
      r.noCandidate       = toMatchingKey("\\u9F9F").unresolved[0].reason;
      r.nfkcCompat        = toMatchingKey("\\u3231").key;
      r.fe0fPreserved     = toMatchingKey("\\u3297\\uFE0F").key.endsWith("\\uFE0F");
      r.rejectsNonString  = (() => { try { reduce(["x"]); return false; } catch { return true; } })();
      r.ok = true;
    } catch (e) { r.ok = false; r.error = String(e && e.stack || e); }
    return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
  }
};
`;

const CONFIG = `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [ (name = "main", worker = .mainWorker) ],
  sockets = [ (name = "http", address = "127.0.0.1:${PORT}", http = (), service = "main") ]
);
const mainWorker :Workerd.Worker = (
  modules = [
    (name = "worker.js", esModule = embed "worker.js"),
    (name = "index.js", esModule = embed "index.js"),
  ],
  compatibilityDate = "2024-11-01",
);
`;

const dir = await mkdtemp(path.join(tmpdir(), "mj-workerd-"));
let child = null;
let failure = null;

try {
  await copyFile(path.join(root, "dist/index.js"), path.join(dir, "index.js"));
  await writeFile(path.join(dir, "worker.js"), WORKER);
  await writeFile(path.join(dir, "config.capnp"), CONFIG);

  const workerdBin = require.resolve("workerd/bin/workerd");
  const logs = [];
  child = spawn(workerdBin, ["serve", "config.capnp"], { cwd: dir });
  child.stdout.on("data", (d) => logs.push(String(d)));
  child.stderr.on("data", (d) => logs.push(String(d)));
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));

  // Poll until the socket answers, but give up rather than hang forever if
  // workerd died on startup (its exit is racing this loop).
  let body = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`workerd exited early (${child.exitCode}):\n${logs.join("")}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      body = await res.json();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (body === null) throw new Error(`workerd never answered on port ${PORT}:\n${logs.join("")}`);

  assert.equal(body.ok, true, `worker threw: ${body.error}`);
  assert.equal(body.reduceUnique, "崎");
  assert.equal(body.reduceResolvedVia, "base");
  assert.equal(body.reduceBasis, "family-register-notice");
  assert.equal(body.isVariant, true);
  assert.equal(body.isVariantFalse, false);
  assert.ok(body.variantCount > 0, "getVariants returned nothing");
  assert.equal(body.matchingKey, "田中崎");
  assert.equal(body.multiHop, "写");
  assert.equal(body.cycleReason, "cycle");
  assert.equal(body.noCandidate, "no-candidate");
  assert.equal(body.nfkcCompat, "(株)", "NFKC did not fold — runtime may lack full ICU");
  assert.equal(body.fe0fPreserved, true);
  assert.equal(body.rejectsNonString, true);

  child.kill("SIGTERM");
  await exited;
  child = null;
  console.log("workerd check OK");
} catch (err) {
  failure = err;
} finally {
  if (child && child.exitCode === null) child.kill("SIGKILL");
  await rm(dir, { recursive: true, force: true });
}

if (failure) {
  console.error(failure);
  process.exit(1);
}
