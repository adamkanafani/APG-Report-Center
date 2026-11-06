// Reads every past ATS report emailed into a job's "7 Reports" folder on T: and records, per report:
// the turbine model, the Observations and Photos section headings, every photo caption's
// Component / Location / Observation and which Photos section it sat under, and the Observations
// table text. Output: one JSON line per report (resumable: reports already in the output are
// skipped). Read-only on T:.
//
// Usage: node scripts/ats-borescope/harvest-reports.mjs <reports.tsv from inventory> <out.jsonl> [concurrency]
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const [tsv, outFile, concArg] = process.argv.slice(2);
const conc = Number(concArg || 3);
const done = new Set(
  fs.existsSync(outFile)
    ? fs.readFileSync(outFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).source)
    : [],
);
const files = fs
  .readFileSync(tsv, "utf8")
  .split("\n")
  .map((l) => l.split("\t")[0])
  .filter((f) => f && /\.(msg|pdf)$/i.test(f) && !done.has(f));
console.log(`to do: ${files.length} (already done: ${done.size})`);

// ---- .msg (OLE compound file) attachment reader -------------------------------------------
function msgAttachments(buf) {
  const secSize = 1 << buf.readUInt16LE(0x1e), miniSize = 1 << buf.readUInt16LE(0x20);
  const cutoff = buf.readUInt32LE(0x38);
  const sector = (n) => buf.subarray(512 + n * secSize, 512 + (n + 1) * secSize);
  const fatSecs = [];
  for (let i = 0; i < 109; i++) { const s = buf.readUInt32LE(0x4c + i * 4); if (s < 0xfffffffa) fatSecs.push(s); }
  for (let d = buf.readUInt32LE(0x44); d < 0xfffffffa; ) {
    const sec = sector(d);
    for (let i = 0; i < secSize / 4 - 1; i++) { const s = sec.readUInt32LE(i * 4); if (s < 0xfffffffa) fatSecs.push(s); }
    d = sec.readUInt32LE(secSize - 4);
  }
  const fat = [];
  for (const s of fatSecs) { const sec = sector(s); for (let i = 0; i < secSize / 4; i++) fat.push(sec.readUInt32LE(i * 4)); }
  const chain = (start, t) => { const o = []; for (let s = start; s < 0xfffffffa && o.length < 2e6; s = t[s]) o.push(s); return o; };
  const big = (start, size) => Buffer.concat(chain(start, fat).map(sector)).subarray(0, size);
  const dir = Buffer.concat(chain(buf.readUInt32LE(0x30), fat).map(sector));
  const E = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = dir.readUInt16LE(o + 0x40);
    E.push({ name: dir.subarray(o, o + Math.max(0, nl - 2)).toString("utf16le"), left: dir.readUInt32LE(o + 0x44), right: dir.readUInt32LE(o + 0x48), child: dir.readUInt32LE(o + 0x4c), start: dir.readUInt32LE(o + 0x74), size: dir.readUInt32LE(o + 0x78) });
  }
  const mini = big(E[0].start, E[0].size);
  const miniFat = [];
  for (const s of chain(buf.readUInt32LE(0x3c), fat)) { const sec = sector(s); for (let i = 0; i < secSize / 4; i++) miniFat.push(sec.readUInt32LE(i * 4)); }
  const read = (e) => (e.size < cutoff ? Buffer.concat(chain(e.start, miniFat).map((s) => mini.subarray(s * miniSize, (s + 1) * miniSize))).subarray(0, e.size) : big(e.start, e.size));
  const kids = (idx) => { const o = []; const w = (i) => { if (i === 0xffffffff || i >= E.length) return; w(E[i].left); o.push(i); w(E[i].right); }; w(E[idx].child); return o; };
  const stream = (idx, n) => { const i = kids(idx).find((c) => E[c].name.toUpperCase() === n); return i === undefined ? null : read(E[i]); };
  const txt = (b) => (b ? b.toString("utf16le").replace(/\0+$/, "") : "");
  const out = [];
  for (const c of kids(0)) {
    if (!E[c].name.startsWith("__attach_version1.0_")) continue;
    const name = txt(stream(c, "__SUBSTG1.0_3707001F")) || txt(stream(c, "__SUBSTG1.0_3704001F"));
    const data = stream(c, "__SUBSTG1.0_37010102");
    if (data) out.push({ name, data });
  }
  return { subject: txt(stream(0, "__SUBSTG1.0_0037001F")), from: txt(stream(0, "__SUBSTG1.0_0C1A001F")), attachments: out };
}

// ---- PDF text, as lines with font size -------------------------------------------------------
async function pdfLines(data) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str?.trim()) continue;
      const y = it.transform[5], x = it.transform[4], size = Math.round(Math.hypot(it.transform[2], it.transform[3]));
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, s: it.str, size });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(rows.map((r) => { r.parts.sort((a, b) => a.x - b.x); return { size: r.parts[0].size, text: r.parts.map((p) => p.s).join(" ").replace(/\s+/g, " ").trim() }; }));
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

// ---- Structure ------------------------------------------------------------------------------
const clean = (s) => s.replace(/\s+/g, " ").replace(/(\b\w) (\w)/g, (m, a, b) => m).trim();
function structure(pages) {
  const all = pages.flatMap((lines, i) => lines.map((l) => ({ ...l, page: i + 1 })));
  const text = all.map((l) => l.text).join("\n");
  const model = (text.match(/Manufacturer Model\s*\n([^\n]+)/) || [])[1] || "";
  const desc = (text.match(/borescope examination of the\s+([^\n]+\n?[^\n]*?)combustion turbine/i) || text.match(/examination of the\s+([^.\n]+)/i) || [])[1] || "";
  const title = pages[0]?.find((l) => /report/i.test(l.text))?.text || "";
  // Table of contents: "Heading ....... 12"
  const toc = all.filter((l) => l.page <= 4 && /\.{5,}/.test(l.text)).map((l) => l.text.replace(/\s*[. ]{5,}\s*\d+\s*$/, "").trim());
  const photosAt = toc.indexOf("Photos"), obsAt = toc.indexOf("Observations");
  const obsSections = obsAt >= 0 ? toc.slice(obsAt + 1, photosAt >= 0 ? photosAt : undefined) : [];
  const photoSections = photosAt >= 0 ? toc.slice(photosAt + 1) : [];
  // Photo captions: walk lines after the Photos heading, tracking the current Photos section.
  const photosStart = all.findIndex((l, i) => l.size >= 14 && l.text === "Photos" && l.page > 3);
  const captions = [];
  let section = null, cur = null;
  const norm = (s) => s.replace(/\s+/g, "").toLowerCase();
  const sectionByNorm = new Map(photoSections.map((s) => [norm(s), s]));
  for (let i = Math.max(0, photosStart); photosStart >= 0 && i < all.length; i++) {
    const t = all[i].text;
    const hit = sectionByNorm.get(norm(t));
    if (hit && all[i].size >= 12) { section = hit; continue; }
    let m;
    if ((m = t.match(/^Component\s+(.+)$/))) { cur = { section, component: m[1], page: all[i].page }; captions.push(cur); continue; }
    if (cur && (m = t.match(/^Location\s+(.+)$/))) cur.location = m[1];
    else if (cur && (m = t.match(/^Observations?\s+(.+)$/))) cur.observation = m[1];
    else if (cur && (m = t.match(/^Comments?\s*(.*)$/))) cur.comments = m[1];
    else if (cur && !cur.location && !cur.observation && all[i].size >= 11 && !/^Page \d+/.test(t)) cur.component += " " + t; // wrapped component name
  }
  // Observations text (pages between the Observations heading and Photos), kept raw for wording.
  const obsStart = all.findIndex((l) => l.size >= 14 && l.text === "Observations" && l.page > 3);
  const observationsText = obsStart >= 0 ? all.slice(obsStart, photosStart >= 0 ? photosStart : undefined).filter((l) => !/^Page \d+ of/.test(l.text)).map((l) => l.text) : [];
  const assessment = (text.match(/Overall Assessment\s*\n([\s\S]*?)\nInspection Details/) || [])[1] || "";
  const recommendations = (text.match(/Significant Observations and Recommendations\s*\n([\s\S]*?)\nLimitation of Liability/) || [])[1] || "";
  return { title, model: model.trim(), unitDescription: desc.replace(/\s+/g, " ").trim(), pages: pages.length, toc, obsSections, photoSections, captions, observationsText, assessment, recommendations };
}

// ---- Run --------------------------------------------------------------------------------------
const out = fs.createWriteStream(outFile, { flags: "a" });
let idx = 0, ok = 0, failed = 0;
async function worker() {
  for (;;) {
    const f = files[idx++];
    if (!f) return;
    const rec = { source: f };
    try {
      const buf = fs.readFileSync(f);
      let pdfs = [];
      if (/\.msg$/i.test(f)) {
        const m = msgAttachments(buf);
        rec.subject = m.subject; rec.from = m.from;
        rec.attachments = m.attachments.map((a) => a.name);
        pdfs = m.attachments.filter((a) => /\.pdf$/i.test(a.name));
      } else pdfs = [{ name: f.split(/[\\/]/).pop(), data: buf }];
      rec.reports = [];
      for (const p of pdfs) {
        try { rec.reports.push({ file: p.name, ...structure(await pdfLines(p.data)) }); }
        catch (e) { rec.reports.push({ file: p.name, error: String(e.message || e) }); }
      }
      ok++;
    } catch (e) { rec.error = String(e.message || e); failed++; }
    out.write(JSON.stringify(rec) + "\n");
    if ((ok + failed) % 25 === 0) console.log(`${ok + failed}/${files.length} (failed ${failed})`);
  }
}
await Promise.all(Array.from({ length: conc }, worker));
out.end();
console.log(`done: ${ok} ok, ${failed} failed`);
