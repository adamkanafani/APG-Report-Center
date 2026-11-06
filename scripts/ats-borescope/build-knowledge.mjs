// Turns the harvested past ATS reports (harvest-ats-reports.mjs output) into:
//  - src/atsBorescope/lib/docx/componentKnowledge.json: for every borescope component name seen in a
//    photo caption, how often ATS filed it under each kind of section (sectionKinds.ts), and
//  - a per-model summary printed to stdout (reports, photo sections, components, coverage).
// Usage: node scripts/ats-borescope/build-knowledge.mjs <reports.jsonl> <componentKnowledge.json> [summary.json]
import fs from "fs";

const [inFile, outFile, summaryFile] = process.argv.slice(2);

// Same wording rules as src/atsBorescope/lib/docx/sectionKinds.ts's sectionKind() -- kept in sync by hand.
function sectionKind(heading) {
  const h = heading.toLowerCase().replace(/\s+/g, " ");
  if (/generator|exciter/.test(h)) return "generator";
  if (/bearing/.test(h)) return "bearing";
  if (/variable inlet guide|\bvigv\b|\bigv\b|inlet guide vane/.test(h)) return "vigv";
  if (/\binlet\b|\bintake\b/.test(h)) return "inlet";
  if (/compressor|\bhpc\b|\blpc\b/.test(h)) return "compressor";
  if (/(combust|burner|chamber|annul).*cold|cold side/.test(h)) return "combustion-cold";
  if (/(combust|burner|chamber|annul).*hot|hot side/.test(h)) return "combustion-hot";
  if (/combust|burner|chamber|annular/.test(h)) return "combustion";
  if (/turbine|\bhpt\b|\blpt\b|power turbine/.test(h)) return "turbine";
  if (/exhaust|diffuser/.test(h)) return "exhaust";
  return "other";
}
const norm = (s) => s.toLowerCase().replace(/(\d) (?=\d)/g, "$1").replace(/[^a-z0-9]+/g, " ").trim();
const cleanModel = (m) => {
  // "Mid Georgia Cogen GT - 101 Westinghouse 501D5A" -> "Westinghouse 501D5A"
  const oem = m.match(/(General Electric|GE|Westinghouse|Siemens Westinghouse|Siemens|Mitsubishi|Alstom|ABB|Rolls[- ]Royce|Pratt|Solar|Hitachi|Ansaldo|Toshiba|Fuji)\b.*$/i);
  return (oem ? oem[0] : m).replace(/\s+/g, " ").trim();
};

// The site/unit name each report repeats in its page header ("Castle Bluff GT - 3") sometimes runs
// into a caption line; it's stripped so no customer or site name ends up in the knowledge file
// (the repo is public), along with the "Classification Typical" caption labels some MDI versions add.
const siteOf = (m) => {
  const oem = m.match(/(General Electric|GE|Westinghouse|Siemens Westinghouse|Siemens|Mitsubishi|Alstom|ABB|Rolls[- ]Royce|Pratt|Solar|Hitachi|Ansaldo|Toshiba|Fuji)\b/i);
  return oem ? m.slice(0, oem.index).trim() : "";
};
const cleanKey = (key, site) => {
  let k = key.replace(/\bclassification\b.*$/, "").trim();
  const s = norm(site);
  if (s && k.includes(s)) k = k.replace(s, "").trim();
  // Anything still ending in a unit tag ("... gt 3", "... gt 101", "... unit 2") is a site leftover.
  k = k.replace(/(\s+[a-z]+){0,4}\s+(gt|ct|unit|st)\s*\d+[a-z]?$/, "").trim();
  return k;
};

const components = {};
const seenIn = {}; // key -> set of report sources, to keep only components seen in several reports
const models = {};
let reports = 0;
for (const line of fs.readFileSync(inFile, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const rec = JSON.parse(line);
  for (const r of rec.reports ?? []) {
    if (r.error || !r.captions) continue;
    reports++;
    const model = cleanModel(r.model || r.unitDescription || "unknown") || "unknown";
    const site = siteOf(r.model || "");
    const m = (models[model] ??= { reports: 0, photoSections: {}, components: {}, captions: 0, jobs: new Set() });
    m.reports++;
    m.jobs.add(rec.source.split(/[\\/]/).slice(-3)[0]);
    for (const s of r.photoSections ?? []) m.photoSections[s] = (m.photoSections[s] ?? 0) + 1;
    for (const c of r.captions) {
      if (!c.component || !c.section) continue;
      const kind = sectionKind(c.section);
      const key = cleanKey(norm(c.component), site);
      if (!key || key.length > 60) continue;
      (seenIn[key] ??= new Set()).add(rec.source + "|" + r.file);
      m.captions++;
      m.components[key] = (m.components[key] ?? 0) + 1;
      (components[key] ??= {})[kind] = (components[key][kind] ?? 0) + 1;
    }
  }
}

fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      source: `Learned from ${reports} past ATS borescope reports in T:\\!Jobs!\\Working Jobs\\400000 (ATS) (scripts/ats-borescope/build-knowledge.mjs)`,
      components: Object.fromEntries(Object.entries(components).filter(([k]) => seenIn[k].size >= 3)),
    },
    null,
    0,
  ) + "\n",
);

const summary = Object.entries(models)
  .map(([model, m]) => ({ model, reports: m.reports, jobs: m.jobs.size, captions: m.captions, distinctComponents: Object.keys(m.components).length, photoSections: Object.entries(m.photoSections).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} (${n})`) }))
  .sort((a, b) => b.reports - a.reports);
if (summaryFile) fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
console.log(`reports: ${reports}, distinct components: ${Object.keys(components).length}, models: ${summary.length}`);
for (const s of summary.slice(0, 60)) console.log(`${String(s.reports).padStart(4)}  ${s.model}  | comps ${s.distinctComponents} | ${s.photoSections.slice(0, 8).join(", ")}`);
