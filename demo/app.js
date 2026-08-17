/**
 * Demo page logic.
 *
 * Everything here runs against the published bundle in ./vendor/, loaded once
 * on page load. Nothing in this file performs a network request afterwards —
 * scripts/verify-demo.mjs asserts that, because the page tells visitors so.
 *
 * User input is echoed back into the page, so nodes are built with
 * textContent rather than innerHTML throughout.
 */

const PRESET_TEXTS = [
  {
    label: "名寄せ（既定）",
    note: "渡邉/渡邊/渡辺 が1グループに。𠮷田 功 は決められない字を含む",
    value: [
      "渡邉 太郎",
      "渡邊 太郎",
      "渡辺 太郎",
      "髙橋 みどり",
      "高橋 みどり",
      "𠮷田 功",
      "吉田 功",
    ].join("\n"),
  },
  {
    label: "決められない・見つからない",
    note: "4行とも縮退しない。行ごとに理由が違うのを見る",
    value: ["朢月", "址", "龟", "㖒"].join("\n"),
  },
  {
    label: "正規化と異体字セレクタ",
    note: "㍿ や ① は正規化で開く。傳+セレクタ は付ける前と答えが変わる",
    value: ["㍿ 髙島屋", "①②③", "傳" + "\u{E0102}", "傳", "伝"].join("\n"),
  },
];

const PRESET_CHARS = [
  { label: "﨑", value: "﨑", note: "外字でよく出る" },
  { label: "髙", value: "髙", note: "はしご高" },
  { label: "𠮷", value: "\u{20BB7}", note: "つちよし" },
  { label: "傳 + IVS", value: "傳\u{E0102}", note: "セレクタで答えが変わる" },
  { label: "葛 + IVS", value: "葛\u{E0101}", note: "項目が無く基底へ落ちる" },
  { label: "朢", value: "朢", note: "候補が2つ・決められない" },
  { label: "功", value: "功", note: "常用漢字でも決められない" },
  { label: "龟", value: "龟", note: "対応表に無い" },
];

const REASON_TEXT = {
  "no-candidate": "MJ縮退マップに項目が無い（この文字は縮退の対象として記録されていない）",
  ambiguous: "候補が複数あり、根拠だけでは1つに決められない",
  cycle: "縮退の連鎖が循環して収束しない（1手ずつは決まるのに、行き先が定まらない）",
  "unsupported-sequence": "異体字セレクタが2つ以上付いているため、変換せずそのまま通した",
};

const BASIS_TEXT = {
  "jis-inclusion-rule": "JIS包摂規準",
  "moj-notice-582-appendix-4": "法務省告示582号 別表第四",
  dictionary: "辞書",
  "family-register-notice": "法務省 戸籍法関連通達・通知",
  "reading-shape-analogy": "読み・字形の類推",
};

/**
 * "base" means two different things depending on the input, and calling both
 * of them a fallback would be wrong: with no selector in the input there was
 * nothing to fall back *from*.
 */
function viaText(resolvedVia, hadSelector) {
  switch (resolvedVia) {
    case "ivs":
      return "IVS（異体字セレクタ）の項目で解決した";
    case "svs":
      return "SVS（標準化変体シーケンス）の項目で解決した";
    case "base":
      return hadSelector
        ? "そのセレクタに対応する項目が無く、基底文字の項目にフォールバックした"
        : "基底文字の項目で解決した";
    case "none":
      return "該当する項目が無かった";
    default:
      return resolvedVia;
  }
}

/** "傳󠄂" -> "U+50B3 U+E0102". Selectors are invisible; the code points are not. */
function codePoints(str) {
  return [...str].map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function glyph(str, extraClass) {
  const node = el("span", "glyph" + (extraClass ? " " + extraClass : ""), str);
  node.title = codePoints(str);
  return node;
}

function basisChips(basis) {
  const wrap = el("span", "chips");
  for (const b of basis) wrap.append(el("span", "chip", BASIS_TEXT[b] ?? b));
  if (basis.length === 0) wrap.append(el("span", "chip chip-none", "根拠の記載なし"));
  return wrap;
}

function unresolvedList(unresolved) {
  const list = el("ul", "unresolved");
  for (const u of unresolved) {
    const li = el("li");
    li.append(glyph(u.char, "glyph-small"));
    li.append(el("code", "reason", u.reason));
    li.append(el("span", "reason-text", REASON_TEXT[u.reason] ?? u.reason));
    const where = el("span", "where");
    // `index` is a 0-based UTF-16 code unit offset, not an ordinal character
    // count, and the two differ on any input containing a surrogate pair —
    // including 𠮷田 功, which this page ships as a default. Naming it
    // "N文字目" would be wrong exactly where the distinction matters.
    where.textContent = `${codePoints(u.char)} / normalized 上のオフセット ${u.index}（UTF-16 コード単位・0 始まり）`;
    li.append(where);
    list.append(li);
  }
  return list;
}

/* ---------- panel 1: toMatchingKey ---------- */

function renderText(lib, input, out) {
  out.replaceChildren();
  const lines = input.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    out.append(el("p", "empty", "1行に1件、名前や語を入れてください。"));
    return;
  }

  // Group by key, first-seen order — this is what "名寄せ" actually means.
  // Results are kept per line, not per group: two lines can land on the same
  // key while reporting different unresolved offsets (NFKC changes lengths),
  // so showing only the first line's report would be quietly wrong.
  const groups = new Map();
  for (const line of lines) {
    let result;
    try {
      result = lib.toMatchingKey(line);
    } catch (err) {
      out.append(el("p", "error", `toMatchingKey("${line}") が例外: ${err.message}`));
      continue;
    }
    if (!groups.has(result.key)) groups.set(result.key, []);
    groups.get(result.key).push({ line, result });
  }

  const summary = el("p", "summary");
  summary.textContent = `${lines.length} 行 → ${groups.size} グループ`;
  out.append(summary);

  for (const [key, entries] of groups) {
    const box = el("div", "group");

    const head = el("div", "group-head");
    head.append(el("span", "group-label", "key"));
    head.append(glyph(key, "glyph-key"));
    head.append(el("span", "group-count", `${entries.length} 件`));
    box.append(head);

    const members = el("ul", "members");
    for (const { line, result } of entries) {
      const li = el("li");
      li.append(el("span", "member-line", line));

      if (result.normalized !== line) {
        const norm = el("span", "normalized");
        norm.append(el("span", "kv-key", "normalized"));
        norm.append(el("span", "kv-value", result.normalized));
        norm.append(el("span", "kv-note", "NFKC で形が変わった。下の位置はこの文字列上の位置"));
        li.append(norm);
      }

      if (result.unresolved.length > 0) {
        const warn = el("div", "warn");
        warn.append(
          el("p", "warn-head", `縮退できなかった文字が ${result.unresolved.length} 件。キーの中ではそのまま残っています。`),
        );
        warn.append(unresolvedList(result.unresolved));
        li.append(warn);
      }

      members.append(li);
    }
    box.append(members);

    if (entries.every((e) => e.result.unresolved.length === 0)) {
      box.append(el("p", "ok", "全文字が縮退済み（unresolved は空）"));
    }

    out.append(box);
  }
}

/* ---------- panel 2: reduce ---------- */

function renderChar(lib, input, out) {
  out.replaceChildren();
  const value = input.trim();
  if (value.length === 0) {
    out.append(el("p", "empty", "1文字入れてください（異体字セレクタは1つまで付けられます）。"));
    return;
  }

  let result;
  try {
    result = lib.reduce(value);
  } catch (err) {
    const box = el("div", "warn");
    box.append(el("p", "warn-head", "reduce() が入力を受け付けませんでした"));
    box.append(el("p", "reason-text", err.message));
    box.append(el("p", "kv-note", "reduce() は1文字ぶんだけを受け取ります。文字列は上の toMatchingKey を使ってください。"));
    out.append(box);
    return;
  }

  const head = el("div", "char-head");
  head.append(glyph(result.input, "glyph-big"));
  const meta = el("div", "char-meta");
  meta.append(el("div", "char-cp", codePoints(result.input)));
  const via = el("div", "char-via");
  via.append(el("code", "via", result.resolvedVia));
  // A variation selector is the second code point when there is one.
  const hadSelector = [...result.input].length > 1;
  via.append(el("span", "reason-text", viaText(result.resolvedVia, hadSelector)));
  meta.append(via);
  head.append(meta);
  out.append(head);

  const uniqueBox = el("div", result.unique === null ? "unique unique-null" : "unique");
  uniqueBox.append(el("span", "kv-key", "unique"));
  if (result.unique === null) {
    uniqueBox.append(el("code", "null-literal", "null"));
    uniqueBox.append(
      el(
        "span",
        "kv-note",
        result.candidates.length === 0
          ? "候補が1つも無いため、代表字を返せません。"
          : "候補が複数あり、根拠だけでは1つに決められないため、あえて選びません。",
      ),
    );
  } else {
    uniqueBox.append(glyph(result.unique, "glyph-key"));
    uniqueBox.append(el("span", "kv-note", "根拠の順位で決着した代表字"));
  }
  out.append(uniqueBox);

  const candHead = el("p", "summary", `candidates: ${result.candidates.length} 件`);
  out.append(candHead);

  if (result.candidates.length === 0) {
    out.append(el("p", "empty", "この文字には MJ縮退マップの項目がありません。"));
  } else {
    const list = el("ul", "candidates");
    for (const c of result.candidates) {
      const li = el("li");
      li.append(glyph(c.char, "glyph-cand"));
      const body = el("div", "cand-body");
      body.append(el("div", "cand-cp", codePoints(c.char)));
      body.append(basisChips(c.basis));
      li.append(body);
      if (c.char === result.unique) li.append(el("span", "cand-win", "採用"));
      list.append(li);
    }
    out.append(list);
  }

  let variants = [];
  try {
    variants = lib.getVariants(value);
  } catch {
    // getVariants rejects inputs reduce() accepted in no case we ship as a
    // preset, but a hand-typed input can differ; showing nothing is fine.
  }
  const varBox = el("div", "variants");
  varBox.append(el("span", "kv-key", "getVariants"));
  if (variants.length === 0) {
    varBox.append(el("span", "kv-note", "この文字に記録された異体字はありません。"));
  } else {
    const inline = el("span", "variant-chars");
    for (const v of variants) {
      const g = glyph(v.char, v.inferred ? "glyph-var glyph-inferred" : "glyph-var");
      g.title = `${codePoints(v.char)}\n${v.basis.map((b) => BASIS_TEXT[b] ?? b).join(" / ")}${v.inferred ? "\n推論エッジ（同じMJ図形の候補どうし。当局がこの2字について述べたものではない）" : ""}`;
      inline.append(g);
    }
    varBox.append(inline);
    const inferredCount = variants.filter((v) => v.inferred).length;
    varBox.append(
      el(
        "span",
        "kv-note",
        inferredCount > 0
          ? `${variants.length} 件。うち ${inferredCount} 件は推論エッジ（点線の枠）——同じMJ図形の候補どうしという関係で、当局がその2字について述べたものではありません。`
          : `${variants.length} 件。すべて直接エッジ（当局の記録がその2字の関係を直接示しているもの）。`,
      ),
    );
  }
  out.append(varBox);
}

/* ---------- wiring ---------- */

function makePresets(container, presets, apply) {
  for (const preset of presets) {
    const button = el("button", "preset");
    button.type = "button";
    button.append(el("span", "preset-label", preset.label));
    if (preset.note) button.append(el("span", "preset-note", preset.note));
    button.addEventListener("click", () => apply(preset.value));
    container.append(button);
  }
}

/**
 * Counts the page's own network activity after the bundle has loaded and shows
 * the running total.
 *
 * The page already told visitors to open DevTools, which is the trustworthy
 * check but not one every reader knows how to run. This puts the same number
 * on the page so the claim is legible without tools — and the copy next to it
 * says outright that a page counting itself is not proof, so the DevTools
 * route stays the answer for anyone who wants one.
 *
 * PerformanceObserver sees fetch/XHR/img/script/css alike, which is wider than
 * patching fetch would be: anything that costs a request shows up here.
 *
 * Entries are filtered by startTime rather than by arrival. A resource whose
 * request began during page load can have its timing entry delivered after the
 * page goes live — the browser's own /favicon.ico does exactly that — and
 * counting it would show every visitor "1 件" for something they did not cause.
 * A meter that cries wolf on load is worse than no meter, because the number
 * it shows during a real leak would look the same.
 */
function startRequestMeter() {
  const output = document.getElementById("request-count");
  if (!output || typeof PerformanceObserver === "undefined") return;

  const startedAt = performance.now();
  let count = 0;
  const observer = new PerformanceObserver((list) => {
    count += list.getEntries().filter((e) => e.startTime >= startedAt).length;
    if (count === 0) return;
    output.textContent = `${count} 件`;
    // Only ever flips on. A page that has made a request has made it.
    if (count > 0) document.getElementById("request-meter")?.classList.add("dirty");
    // Read by scripts/verify-demo.mjs, which asserts this stays at 0.
    document.body.dataset.requestsAfterReady = String(count);
  });
  observer.observe({ type: "resource", buffered: false });
  document.body.dataset.requestsAfterReady = "0";
}

async function main() {
  const loading = document.getElementById("loading");
  const loadError = document.getElementById("load-error");

  let lib;
  try {
    lib = await import("./vendor/itaiji-normalize.js");
  } catch (err) {
    loading.hidden = true;
    loadError.hidden = false;
    loadError.textContent = `ライブラリの読み込みに失敗しました: ${err.message}`;
    return;
  }

  const textInput = document.getElementById("text-input");
  const textOutput = document.getElementById("text-output");
  const charInput = document.getElementById("char-input");
  const charOutput = document.getElementById("char-output");

  const runText = () => renderText(lib, textInput.value, textOutput);
  const runChar = () => renderChar(lib, charInput.value, charOutput);

  makePresets(document.getElementById("text-presets"), PRESET_TEXTS, (v) => {
    textInput.value = v;
    runText();
  });
  makePresets(document.getElementById("char-presets"), PRESET_CHARS, (v) => {
    charInput.value = v;
    runChar();
  });

  textInput.addEventListener("input", runText);
  charInput.addEventListener("input", runChar);

  // Prefilled on purpose: the page must show a real result, including a
  // failure case, before the visitor types anything.
  textInput.value = PRESET_TEXTS[0].value;
  charInput.value = PRESET_CHARS[0].value;
  runText();
  runChar();

  loading.hidden = true;
  document.getElementById("panel-text").hidden = false;
  document.getElementById("panel-char").hidden = false;
  startRequestMeter();
  document.body.dataset.ready = "1";
}

void main();
