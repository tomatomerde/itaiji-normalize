#!/usr/bin/env python3
"""Extract needed columns from MJ文字情報一覧表 xlsx to TSV (streaming, stdlib only).

Usage: extract-mji.py <xlsx> <out.tsv>
Columns kept: MJ文字図形名, 対応するUCS, 実装したUCS, 実装したMoji_JohoコレクションIVS,
実装したSVS, 対応する互換漢字, X0213
"""
import sys, zipfile, re
import xml.etree.ElementTree as ET

NS = "{http://purl.oclc.org/ooxml/spreadsheetml/main}"
WANT = ["MJ文字図形名", "対応するUCS", "実装したUCS", "実装したMoji_JohoコレクションIVS",
        "実装したSVS", "対応する互換漢字", "X0213"]

xlsx, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(xlsx)

# shared strings
strings = []
with z.open("xl/sharedStrings.xml") as f:
    for ev, el in ET.iterparse(f):
        if el.tag == NS + "si":
            strings.append("".join(t.text or "" for t in el.iter(NS + "t")))
            el.clear()

def col_index(ref):  # "BC12" -> 54 (0-based column)
    i = 0
    for ch in ref:
        if ch.isalpha():
            i = i * 26 + (ord(ch.upper()) - 64)
        else:
            break
    return i - 1

rows = 0
header = None
want_idx = None
with z.open("xl/worksheets/sheet1.xml") as f, open(out, "w", encoding="utf-8") as w:
    for ev, el in ET.iterparse(f):
        if el.tag != NS + "row":
            continue
        cells = {}
        for c in el.iter(NS + "c"):
            ref = c.get("r") or ""
            t = c.get("t")
            v = c.find(NS + "v")
            if t == "s" and v is not None:
                val = strings[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(NS + "t"))
            elif v is not None:
                val = v.text or ""
            else:
                val = ""
            cells[col_index(ref)] = val
        if header is None:
            header = cells
            name_to_idx = {v: k for k, v in cells.items()}
            missing = [c for c in WANT if c not in name_to_idx]
            if missing:
                sys.exit(f"missing columns: {missing}")
            want_idx = [name_to_idx[c] for c in WANT]
            w.write("\t".join(WANT) + "\n")
        else:
            w.write("\t".join(cells.get(i, "") for i in want_idx) + "\n")
            rows += 1
        el.clear()
print(f"rows written: {rows}")
