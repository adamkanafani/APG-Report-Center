import { promises as fs } from "fs";
import path from "path";
import { parseJobMetadataFromFolderName, type JobMetadata } from "../ingest/jobMetadata";
import { readDeck, slideTitle, type DeckSlide } from "../pptx/readDeck";
import { readReportRecord } from "./reportRecord";
import { toLongPath } from "../util/longPath";
import { PREFERRED_EXAMPLE_JOBS } from "../report-templates/exemplars";

// "Start from the last report for the same product." Across Alfredo Resendiz's ~90 GE nozzle
// reports, 85–95% of each Repair Recommendations list is the same lines job to job for a given
// product (e.g. 21 lines appear in all 9 F7EA S1N I&A reports surveyed), the Engineering Summary
// always has the same subheadings with many finding lines repeated word for word, and the opening
// sentence only changes the received date. So the best first draft for a new job is the most
// recent finished report of the same model + stage/row, with the job-specific values swapped out --
// not wording generated from the router.

export interface ProductKey {
  family: string;
  stage: number | null;
  /** "support-ring" (inner support rings -- Alfredo's) and "vane-carrier" (GT11 vane carriers --
   * Adan's and Elmer's) are their own products: drafted only from earlier reports of the same kind,
   * never from nozzle or vane reports. */
  /** Any other part Adan and Elmer report on ("compressor diaphragm", Job 20992) is keyed by its own
   * name, so it drafts only from earlier reports of that same part. */
  kind:
    | "nozzle"
    | "vane"
    | "support-ring"
    | "vane-carrier"
    | "blade-ring"
    | "blade-ring-segment"
    | "compressor-blade-ring"
    | "compressor-stator"
    | "compressor-diffuser"
    | "iso"
    | "air-seal"
    | `part:${string}`;
}

/** The rest of the parts Elmer Gomez and Adan Aguirre report on (T: survey, jobs 20000-20999), by
 * how their job folders name them. First match wins, so "ROW 3 BLADE RING (VANE SWAP)" is a blade
 * ring, not vanes, and "ROW 4 BLADE RING SEGMENTS" (W501D5A) isn't a whole blade ring. Scope words
 * (DISASSEMBLY, ASSEMBLY, VANE SWAP, "ISOS FROM 20479") don't matter -- the same part, the same
 * report. */
const NAMED_PARTS: Array<[RegExp, ProductKey["kind"]]> = [
  [/support\s*ring/i, "support-ring"],
  [/va[nv]e\s*carrier/i, "vane-carrier"],
  [/compressor\s+blade\s+rings?/i, "compressor-blade-ring"],
  // "BLADE RING SEGMENTS" and plain "RING SEGMENTS" are the same part -- the tech reps title both
  // decks "Ring Segments" (18278 "501F Row 3 Ring Segments I&A Report", 20596 "W501D5A R1 RS").
  [/(blade\s+)?ring\s+segm[a-z]*/i, "blade-ring-segment"],
  [/blade\s+rings?/i, "blade-ring"],
  [/\bisos?\b|\biso'?s\b|isolation\s+seg/i, "iso"],
  // A torque tube seal housing (W251, Job 16549) is its own part, not an air seal.
  [/torque\s+tube/i, "part:torque tube seal housing"],
  // Air seal = inner stage seal housing ("ISSH") -- the same component, per Elmer Gomez.
  [/seal\s+housing|\bissh\b|air\s+seals?\b/i, "air-seal"],
  // Compressor stator vanes (F7FA S17 -- "S-17 STATOR VANES", "STATORS ITEM# 708171", "SHROUDED
  // S17 STATOR PACKS": all "... S17 Stator Vanes IA Report") aren't turbine vanes. A generator's
  // stator isn't one either, nor a stator casing ("STATOR CASING REPAIRS", field service).
  [/^(?!.*(generator|casing|\bcase\b|lamination)).*\bstators?\b/i, "compressor-stator"],
  // V84.2 "COMPRESSOR INNER DIFFUSER" / "COMPRESSOR DIFFUSER INNER RING" -- one "Compressor Diffuser" deck.
  [/compressor\s+(inner\s+)?diffuser/i, "compressor-diffuser"],
];

/** "ROW 11COMPRESSOR DIAPHRAGM" (Job 20989) → "ROW 11 COMPRESSOR DIAPHRAGM": a number run into the
 * next word. Two-letter endings stay ("1ST", "CM2"). */
const spaced = (s: string) => s.replace(/(\d)([A-Za-z]{3,})/g, "$1 $2");

/** Row / stage / number: "1ST STAGE", "ROW 7", "NUM. 1", "NUMB. 2", "#3". Null for a job covering
 * several ("#1-3 COMPRESSOR BLADE RINGS") or none. */
function stageOf(text: string): number | null {
  if (/#\s*\d+\s*-\s*\d+/.test(text)) return null;
  // A range of rows is a set ("ROW 1 THRU 6 COMPRESSOR DIAPHRAGMS", "ROW 4 - 6", "ROWS 6 - 16").
  if (/\b(?:rows?|stages?|r)\s*\d{1,2}\s*(?:-|thru|through|to)\s*\d{1,2}\b/i.test(text)) return null;
  // "2 STAGE SHROUD BLOCKS" (Job 18605): the number before the word.
  const before = text.match(/\b(\d{1,2})\s+(?:stage|stg)\b/i);
  if (before) return Number(before[1]);
  const m = text.match(/\b(?:row|stage|num(?:b(?:er)?)?\.?|no\.)\s*(\d{1,2})\b|#\s*(\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)\b|\b(first|second|third|fourth|fifth)\b/i);
  // Failing those, a compressor stage written "S17" / "S-17" (F7FA stator vanes).
  if (!m) {
    const s = text.match(/\bS-?(\d{1,2})\b/i);
    return s ? Number(s[1]) : null;
  }
  const words = ["first", "second", "third", "fourth", "fifth"];
  return Number(m[1] ?? m[2] ?? m[3]) || words.indexOf((m[4] ?? "").toLowerCase()) + 1 || null;
}

const STOP_WORDS =
  /^(first|second|third|fourth|fifth|set|of|qty|from|removed|disassembly|assembly|asm|installation|new|i|a|tbd|pending|stage|stg|row|rows|unit|po|eq|man|mfg|manufacture|cpi|hole|tech|warranty|work|mod|and|only|each|jde|item|thru|through|to|–|—)$/;

/** "CM2 ROW 1 COMPRESSOR DIAPHRAGM" → "compressor diaphragm": the part's words once the model,
 * row / stage and code tokens ("CM2", "R1") are dropped. */
function otherPartName(text: string, model = ""): string {
  const words = text.trim().split(/\s+/);
  // The part text starts with the model ("F7C-E 1ST STAGE ...") -- its pieces aren't the part.
  if (model && words[0]?.toUpperCase() === model.toUpperCase()) words.shift();
  return spaced(words.join(" "))
    .toLowerCase()
    .replace(/bloock/g, "block")
    // Unit / plant designators ("HM-GT1", "YK-CT3", "HR-GT6") and "I&A ONLY".
    .replace(/\b[a-z]{1,3}-?(gt|ct)\d+[a-z]?\b|\bi\s*&\s*a\b/g, " ")
    .replace(/\b(row|stage|r|num(?:b)?\.?|no\.)\s*\d+\b|#\s*\d+|\b\d+(st|nd|rd|th)\b|\(qty\s*\d+\)|\beq\s*#?\s*\d+/g, " ")
    .split(/[\s()&/.,#-]+/)
    // Scope, paperwork and stage words ("1ST STAGE SHROUD BLOCKS - UNIT 42", "... NEW MAN. (CPI)",
    // "... PO# 4500564118", "... EQ TBD", "(10 HOLE)") aren't the part: they'd split one product into many.
    .filter((w) => w && !/\d/.test(w) && !STOP_WORDS.test(w.replace(/[.#,]+$/, "")))
    .map((w) => w.replace(/s$/, ""))
    .join(" ");
}

/** "F7EA" / "7EA" → "F7EA", "6B" → "F6B", "W501D5A" / "501D5" / "D5A" → "501D5", "W501F" → "501F",
 * "MHI 501F" → "MHI501F" (Mitsubishi's 501F vanes are a different part from Siemens'). */
function normalizeFamily(model: string): string {
  // "FR9EA" → "F9EA"; Liburdi's "11N2" is Alstom's GT11N2.
  const m = model.toUpperCase().replace(/\s+/g, "").replace(/^FR(?=\d)/, "F").replace(/^(11N)/, "GT$1");
  const ge = m.match(/^F?([3-9][A-Z]{1,3})/);
  if (ge) return `F${ge[1]}`;
  if (/^D5A?$/.test(m)) return "501D5";
  const w = m.match(/^(MHI)?W?(501[A-Z]+\d?)/);
  // "501FF" (Job 20715) is a typo for 501F.
  if (w) return `${w[1] ?? ""}${w[2].replace(/A$/, "").replace(/([A-Z])\1$/, "$1")}`;
  return m;
}

export function productKeyFor(metadata: Pick<JobMetadata, "turbineModel" | "part" | "component">): ProductKey | null {
  const text = spaced(`${metadata.part} ${metadata.component}`);
  if (/pilot|fuel|parts?\s*sale/i.test(text)) return null;
  // Order matters: "1ST STAGE NOZZLE INNER SUPPORT RING" is a support ring, not a nozzle; "VANE
  // CARRIER" (also misspelled "VAVE CARRIER", Job 18177) is a carrier, not vanes. Other carriers
  // (combustor tile carriers, carrier heat shields, stator carrier rings) aren't V&N report parts.
  const other = otherPartName(metadata.part, metadata.turbineModel);
  const named = NAMED_PARTS.find(([pattern]) => pattern.test(text))?.[1];
  // No turbine model in the folder name: only the named parts can still be told apart ("CALPINE
  // BT-GT4 ROW 1 ISOS", Job 20307); their family is left blank and matches any model.
  if (!metadata.turbineModel && !named) return null;
  const kind: ProductKey["kind"] | null = named
    ? named
    : /carrier/i.test(text)
      ? null
      : /vane/i.test(text)
        ? "vane"
        : /nozzle/i.test(text)
          ? "nozzle"
          : other
            ? `part:${other}`
            : null;
  if (!kind) return null;
  // A support ring is always the 1st-stage ring -- its stage words don't distinguish anything. A
  // carrier's row ("ROW 1 VANE CARRIER SEGMENTS") does; a whole carrier has none. Every other part's
  // row / number does ("ROW 7 COMPRESSOR DIAPHRAGM" drafts from row 7, not row 12).
  const family = metadata.turbineModel ? normalizeFamily(metadata.turbineModel) : "";
  if (kind === "support-ring") return { family, stage: null, kind };
  return { family, stage: stageOf(text), kind };
}

/** Same product, ignoring the MHI marker -- which isn't always in the folder name (Job 19168's
 * folder says "501F ROW 1 VANES"; only its deck, "19168 SP-GTA MHI R1V IA Report", says MHI), so
 * MHI-ness is settled per deck in findPriorReport instead. */
const baseFamily = (family: string) => family.replace(/^MHI/, "");
/** A bare GE frame ("F5", most Frame 5 job folders) matches its variants ("F5P", "F5LA", "F5N"). */
const bareFrame = (a: string, b: string) => (/^F\d$/.test(a) && b.startsWith(a)) || (/^F\d$/.test(b) && a.startsWith(b));
function sameProduct(a: ProductKey, b: ProductKey): boolean {
  // A blank family (no model in the folder name) matches any model.
  const familyMatch = !a.family || !b.family || baseFamily(a.family) === baseFamily(b.family) || bareFrame(a.family, b.family);
  return familyMatch && a.stage === b.stage && a.kind === b.kind;
}

// Listing every job folder under "Working Jobs" walks a couple hundred bucket folders on a network
// drive -- cached for the life of the server process (a new job showing up mid-session only
// matters as a *source* once it has a finished report, which takes weeks).
const listingCache = new Map<string, Promise<Array<{ folder: string; name: string }>>>();

function listJobFolders(workingJobs: string) {
  let p = listingCache.get(workingJobs);
  if (!p) {
    p = (async () => {
      const out: Array<{ folder: string; name: string }> = [];
      const buckets = await fs.readdir(toLongPath(workingJobs), { withFileTypes: true }).catch(() => []);
      await Promise.all(
        buckets
          .filter((b) => /^\d{4,6}$/.test(b.name))
          .map(async (b) => {
            const bucket = path.join(workingJobs, b.name);
            const jobs = await fs.readdir(toLongPath(bucket), { withFileTypes: true }).catch(() => []);
            for (const j of jobs) if (/^\d{4,6}\s/.test(j.name)) out.push({ folder: path.join(bucket, j.name), name: j.name });
          })
      );
      return out;
    })();
    listingCache.set(workingJobs, p);
  }
  return p;
}

export interface PriorReport {
  jobNumber: string;
  jobFolderName: string;
  file: string;
}

const REPORT_DIRS = { ia: path.join("7 Reports", "7A Inspection Report"), repair: path.join("7 Reports", "7B Final Report") };
// How the tech reps name their finished decks across Working Jobs 16000-21700: the I&A deck is
// "... IA Report", "... I&A Report", "... Incoming Report" or "... Inspection Report" (shroud
// blocks, 16115); the repair deck "... Repair Report" or "... Final Report" (220 of ~650 7B decks,
// e.g. 16098 "... CD Final Report"). A "Final Inspection Report" is the repair one.
const REPORT_NAME = {
  ia: /\b(i\s*&?\s*a|incoming|(?<!final\s)inspection)\s*report/i,
  repair: /\b(repair|final(\s+inspection)?)\s*report/i,
};

/** The most recent other job of the same product (by job number) that has a finished report deck
 * of the requested kind -- the standard deck, not the "-FS" field-service short version or a
 * "Copy of". Only looks inside the same "Working Jobs" tree the current job lives in. */
/** Where APG's job folders live -- the fallback search location for past reports (see
 * findPriorReport). Overridable with VN_WORKING_JOBS for a machine that maps the share elsewhere. */
const DEFAULT_WORKING_JOBS = process.env.VN_WORKING_JOBS || "T:\\!Jobs!\\Working Jobs";

/** The newest report PDF in `dir` that this app built (it carries a ReportRecord) -- what tech reps
 * save now in place of a PowerPoint deck, so it's learned from ahead of any deck in the folder. */
async function builtReport(dir: string, names: string[], kind: "ia" | "repair"): Promise<string | null> {
  const found: Array<{ file: string; time: number }> = [];
  for (const n of names.filter((n) => /\.pdf$/i.test(n) && REPORT_NAME[kind].test(n) && !/^~\$|^copy of|[\s_-]fs\.pdf$|- copy/i.test(n))) {
    const file = path.join(dir, n);
    if (!(await readReportRecord(file))) continue;
    found.push({ file, time: (await fs.stat(toLongPath(file)).catch(() => null))?.mtimeMs ?? 0 });
  }
  return found.sort((a, b) => b.time - a.time)[0]?.file ?? null;
}

function deckRank(name: string): number {
  if (/\brev(ised)?\b/i.test(name)) return 0;
  return /report\.pptx$/i.test(name) ? 1 : 2;
}

export async function findPriorReport(jobRoot: string, metadata: JobMetadata, kind: "ia" | "repair"): Promise<PriorReport | null> {
  const key = productKeyFor(metadata);
  if (!key) return null;
  // Normally the Working Jobs tree the job itself sits in. A job copied somewhere else (a test copy
  // in OneDrive, say) still looks up past reports on the shared drive -- this job's own number is
  // skipped below either way, so a test copy never drafts from its own finished report left there.
  const parentTree = path.dirname(path.dirname(jobRoot));
  const workingJobs = /working jobs/i.test(path.basename(parentTree)) ? parentTree : DEFAULT_WORKING_JOBS;
  if (!(await fs.stat(toLongPath(workingJobs)).catch(() => null))?.isDirectory()) return null;

  // A rework job ("16009-9") sits right after its original job (16009).
  const current = parseInt(metadata.jobNumber, 10) || Number.MAX_SAFE_INTEGER;
  // The tech reps' own picked examples first (see exemplars.ts), then earlier jobs (most recent
  // of those first), then later ones -- a later job number can still be the newest *finished*
  // report when this job is an old one being revisited.
  const byPreference = (a: { meta: JobMetadata }, b: { meta: JobMetadata }) => {
    const ap = PREFERRED_EXAMPLE_JOBS.includes(a.meta.jobNumber), bp = PREFERRED_EXAMPLE_JOBS.includes(b.meta.jobNumber);
    if (ap !== bp) return ap ? -1 : 1;
    const an = Number(a.meta.jobNumber), bn = Number(b.meta.jobNumber);
    const aBefore = an < current, bBefore = bn < current;
    if (aBefore !== bBefore) return aBefore ? -1 : 1;
    return aBefore ? bn - an : an - bn;
  };
  const others = (await listJobFolders(workingJobs))
    .map((j) => ({ ...j, meta: parseJobMetadataFromFolderName(j.folder) }))
    .filter((j) => j.meta.jobNumber && j.meta.jobNumber !== metadata.jobNumber)
    .map((j) => ({ ...j, key: productKeyFor(j.meta) }));
  const candidates = others
    .filter((j) => {
      const k = j.key;
      if (k === null) return false;
      // A picked support-ring example serves every model (Alfredo: 20062, an F7B ring) -- support
      // ring reports have the same structure across F7B / F7EA / F7FA (checked 17366, 20062,
      // 20097, 20855); only the most-recent fallback stays within the same model.
      if (key.kind === "support-ring" && k.kind === "support-ring" && PREFERRED_EXAMPLE_JOBS.includes(j.meta.jobNumber)) return true;
      return sameProduct(k, key);
    })
    .sort(byPreference);
  // Compressor-side parts and other named parts (seal holders, compressor diaphragms, stators) are
  // reported the same way row to row: with no earlier report of this row (Calpine DE-GT3's CD seal
  // holders, rows 7-15, Jobs 17773-17781), the nearest row's report is the next best start. Turbine
  // nozzles, vanes, blade rings and their seals stay row-for-row -- a 1st stage isn't a 2nd.
  // A folder name with no row at all ("F7FA STATORS ITEM# 708171", Job 18583) takes any row's.
  // Each list gets its own 25 folders to look in: old same-row jobs with no deck (pre-2016 stator
  // jobs) mustn't use up the search before the other rows are tried.
  const toCheck = candidates.slice(0, 25);
  if (key.kind.startsWith("part:") || key.kind === "compressor-stator" || key.kind === "compressor-blade-ring") {
    const distance = (k: ProductKey) => (key.stage === null ? 0 : Math.abs((k.stage ?? 99) - key.stage));
    toCheck.push(
      ...others
        .filter((j) => j.key && j.key.stage !== key.stage && sameProduct({ ...j.key, stage: key.stage }, key))
        .sort((a, b) => distance(a.key!) - distance(b.key!) || byPreference(a, b))
        .slice(0, 25)
    );
  }

  for (const c of toCheck) {
    const dir = path.join(c.folder, REPORT_DIRS[kind]);
    const names = await fs.readdir(toLongPath(dir)).catch(() => [] as string[]);
    // The finished deck: not an Office lock file, a "Copy of"/"- Copy", or the "-FS" field-service
    // short version. A "REV"/"REVISED" deck is the corrected one, so it wins; then a plain
    // "... Report.pptx" over a variant like "... Report  hardware pictures.pptx" (Job 19163).
    // A report PDF the app built comes first (see builtReport).
    const built = await builtReport(dir, names, kind);
    const deck = built
      ? path.basename(built)
      : names
          .filter((n) => /\.pptx$/i.test(n) && REPORT_NAME[kind].test(n) && !/^~\$|^copy of|[\s_-]fs\.pptx$|- copy/i.test(n))
          .sort((a, b) => deckRank(a) - deckRank(b) || a.length - b.length)[0];
    // MHI vs Siemens 501F: the candidate is MHI when its folder or its report says so.
    if (deck && key.family.startsWith("MHI") !== (/\bmhi\b/i.test(c.name) || /\bmhi\b/i.test(deck))) continue;
    if (deck) return { jobNumber: c.meta.jobNumber, jobFolderName: c.name, file: path.join(dir, deck) };
  }
  return null;
}

/** This job's own finished deck of the given kind -- for the Repair Report, the job's I&A deck in
 * "7A Inspection Report": its cover is the tech rep's corrected one (customer site, PO, serials,
 * material, coating, boxes) and its recommendations are what the Repair Summary restates in the
 * past tense (Job 20992). Same pick rules as findPriorReport. */
export async function findOwnReport(jobRoot: string, jobNumber: string, kind: "ia" | "repair"): Promise<PriorReport | null> {
  const dir = path.join(jobRoot, REPORT_DIRS[kind]);
  const names = await fs.readdir(toLongPath(dir)).catch(() => [] as string[]);
  const built = await builtReport(dir, names, kind);
  if (built) return { jobNumber, jobFolderName: path.basename(jobRoot), file: built };
  const deck = names
    .filter((n) => /\.pptx$/i.test(n) && REPORT_NAME[kind].test(n) && !/^~\$|^copy of|[\s_-]fs\.pptx$|- copy/i.test(n))
    .sort((a, b) => deckRank(a) - deckRank(b) || a.length - b.length)[0];
  return deck ? { jobNumber, jobFolderName: path.basename(jobRoot), file: path.join(dir, deck) } : null;
}

/** What a past report deck contributes to a new job's drafts. */
export interface PriorDraft {
  source: PriorReport;
  engineeringSummary?: string;
  repairRecommendations?: string;
  /** The shorter Fleet Service list, when the deck has both (see splitRecommendations). */
  repairRecommendationsCompact?: string;
  repairSummary?: string;
  /** Cover / component-details label → value, e.g. "Tech Rep" → "Alfredo Resendiz T.". */
  coverFields: Record<string, string>;
  /** Cover labels in order, including ones written with the value inline ("EQ# 11392387" → "EQ#"). */
  coverLabels: string[];
  /** Divider slide titles in deck order ("Serial Number List", "Flow Test", ...). */
  dividers: string[];
  /** Photo slide titles ("NDT Photos (Blade Ring)", "Shipping") -- see learnPhotoTitles. */
  photoTitles: string[];
  /** The two cover slides' values keyed by this app's cover field keys (customer, detailsCustomer,
   * serialNumbers, coating, ...), multi-line values kept as lines. */
  coverValues: Record<string, string>;
  /** Each cover label exactly as the author writes it, colon or not ("Unit#", "Prior Repair:"). */
  coverLabelsExact: Record<string, string>;
  /** The author puts the EQ# under the PO number ("TM020-... / EQ#: 10956713") rather than on a row
   * of its own (Adan Aguirre, Job 20992). */
  assetWithPO: boolean;
}

const COVER_KEY_FOR_LABEL: Record<string, string> = {
  customerpo: "customerPO", po: "customerPO", eq: "assetNumber", asset: "assetNumber", unit: "unit", parttype: "part",
  techrep: "techRep", turbinemodel: "turbineModel", component: "component", serials: "serialNumbers", serial: "serialNumbers",
  serialnumbers: "serialNumbers", partnumbers: "partNumbers", partnumber: "partNumbers", quantity: "quantity", qty: "quantity",
  material: "material", coating: "coating", priorrepair: "priorRepair", priorrepairs: "priorRepair", priorhours: "hours",
  priorstarts: "starts", boxes: "boxes", incomingofboxes: "boxes",
  // Alfredo Resendiz's wording (19797): "Current total Hrs", "Current Starts", "Prior job #'s".
  currenttotalhrs: "hours", currenthrs: "hours", currenthours: "hours", currentstarts: "starts", priorjobs: "priorRepair",
};

/** The cover slides (the first slides with a "Customer:" row), read label by label. A paragraph
 * with no label continues the one above it on a new line ("TW68353, TW68354, TW57210" under
 * "Serial #'s:", "(New crate needed)" under "Boxes:"). "Customer" on the second slide is the
 * component-details page's own customer; an "EQ#: …" tacked onto the PO line is the asset #. */
function coverValues(slides: DeckSlide[]): { values: Record<string, string>; labels: Record<string, string>; assetWithPO: boolean } {
  const out: Record<string, string> = {};
  const labels: Record<string, string> = {};
  let assetWithPO = false;
  // The cover, then the details slide after it -- which Alfredo Resendiz's covers (19797) start at
  // "Turbine Model:" with no "Customer:" row.
  const shown = slides.slice(0, 6).filter((s) => !s.hidden);
  const first = shown.findIndex((s) => /customer\s*:/i.test(s.text));
  const next = first >= 0 ? shown[first + 1] : undefined;
  const covers = first < 0 ? [] : [shown[first], ...(next && /(customer|turbine model|component|material|part numbers?)\s*:/i.test(next.text) ? [next] : [])];
  covers.forEach((slide, slideIndex) => {
    const shapes = [...slide.shapes].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const shape of shapes) {
      let current: string | null = null;
      for (const p of shape.paragraphs) {
        const raw = p.text.replace(/ /g, " ");
        if (!raw.trim()) continue;
        const m = raw.match(/^\s*([A-Za-z][A-Za-z #'’/.]{0,24}?)\s*:\s*(.*)$/) ?? raw.match(/^\s*([A-Za-z][A-Za-z #'’/.]{0,24}?)\s*\t+\s*(.*)$/);
        const labelKey = m ? m[1].toLowerCase().replace(/[^a-z]/g, "") : "";
        const key = labelKey === "customer" ? (slideIndex === 0 ? "customer" : "detailsCustomer") : COVER_KEY_FOR_LABEL[labelKey];
        if (m && key) {
          let rawValue = m[2];
          const eq = rawValue.match(/^([\s\S]*?)\s*\b((?:EQ|Asset)\s*#\s*:?)\s*(\d{5,})\s*$/i);
          if (eq) {
            rawValue = eq[1];
            out.assetNumber ??= eq[3];
            labels.assetNumber ??= clean(eq[2]).replace(/\s+/g, "");
            if (key === "customerPO") assetWithPO = true;
          }
          // A run of tabs inside a value is where the author broke the line ("W501F Row 1 CM2<tabs>
          // Compressor Diaphragm" prints as two lines on his cover).
          const value = rawValue
            .split(/\t{2,}|\t[ ]+\t/)
            .map(clean)
            .filter(Boolean)
            .join("\n");
          labels[key] ??= clean(m[1]) + (/^\s*[A-Za-z][A-Za-z #'’/.]{0,24}?\s*:/.test(raw) ? ":" : "");
          current = key;
          if (value && !out[key]) out[key] = value;
        } else if (m && labelKey) {
          current = null; // a label this app has no field for ("APG Job #", "Date")
        } else if (current && out[current]) {
          out[current] += `\n${clean(raw)}`;
        }
      }
    }
  });
  return { values: out, labels, assetWithPO };
}

const clean = (s: string) => s.replace(/\t+/g, " ").replace(/\s+/g, " ").trim();

function isHeading(p: { text: string; bold: boolean; underline: boolean }): boolean {
  const t = clean(p.text);
  if (!t.endsWith(":") || t.length > 70) return p.bold && p.underline && t.length <= 70;
  return p.bold || p.underline || /inspection|ring|hardware|replacement|repair|assembly|packing|dimension/i.test(t);
}

/** The slides titled `title` (a summary can run over two), turned into this app's narrative markup:
 * headings → "Heading:", body paragraphs → "- bullet", lead-in sentences ("An F7FA 1st stage
 * nozzle was received...", "APG recommends the following repairs:") → plain paragraphs. */
function sectionMarkup(slides: DeckSlide[], title: RegExp): string | undefined {
  const matching = slides.filter((s) => !s.hidden && title.test(slideTitle(s)));
  if (matching.length === 0) return undefined;
  const lines: string[] = [];
  for (const slide of matching) {
    const titleText = slideTitle(slide);
    const shapes = [...slide.shapes].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const shape of shapes) {
      const shapeText = clean(shape.paragraphs.map((p) => p.text).join(" "));
      if (shapeText === titleText) continue;
      for (const p of shape.paragraphs) {
        const t = clean(p.text);
        if (!t) continue;
        if (/(was|were) received|^apg (recommends|performed)|^note:/i.test(t)) {
          if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
          lines.push(t);
          continue;
        }
        if (isHeading(p)) {
          if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
          lines.push(t.endsWith(":") ? t : `${t}:`);
          continue;
        }
        lines.push(`- ${t}`);
      }
    }
  }
  while (lines[lines.length - 1] === "") lines.pop();
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/** Label/value pairs off the two cover slides ("Tech Rep: \t\tAlfredo Resendiz T."). */
function coverFields(slides: DeckSlide[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const slide of slides.slice(0, 3)) {
    for (const shape of slide.shapes) {
      for (const p of shape.paragraphs) {
        const m = p.text.match(/^\s*([A-Za-z][A-Za-z #'/]*?)\s*:?\s*\t+\s*(.+?)\s*$/) ?? p.text.match(/^\s*([A-Za-z][A-Za-z #'/]*?):\s+(.+?)\s*$/);
        if (m && m[2].trim()) fields[clean(m[1]).replace(/:$/, "")] ??= clean(m[2]);
      }
    }
  }
  return fields;
}

/** Labels down the two cover slides, in order -- "Customer:<tab>…", or an inline "EQ# 11392387" /
 * "WO# 4500…" with no colon. */
function coverLabels(slides: DeckSlide[]): string[] {
  const labels: string[] = [];
  for (const slide of slides.slice(0, 2)) {
    for (const shape of slide.shapes) {
      for (const p of shape.paragraphs) {
        const t = p.text.trim();
        const m = t.match(/^([A-Za-z][A-Za-z #'/.]*?)\s*(:|	)/) ?? t.match(/^([A-Z]{2,4}#)\s*\S/);
        if (m) labels.push(clean(m[1]).replace(/:$/, ""));
      }
    }
  }
  return labels;
}

/** Divider slides: no pictures, a single short line of text, not a cover / summary / list slide. */
function dividerTitles(slides: DeckSlide[]): string[] {
  return slides
    .filter((s) => !s.hidden && s.pictures === 0 && s.shapes.length === 1 && s.text.length > 0 && s.text.length <= 60)
    .map((s) => s.text)
    .filter((t) => !/(incoming|repair)\s*report$|engineering summary|recommendation|repair summary/i.test(t));
}

/** Adan's Calpine decks carry two Repair Recommendations slides -- the full list, then the shorter
 * Fleet Service one (Job 20992: 28 vs 23 lines) -- each opening "APG recommends the following
 * repairs:". Split them: the longer is the standard list, the shorter the compact one. */
function splitRecommendations(markup: string | undefined): { standard?: string; compact?: string } {
  if (!markup) return {};
  const blocks = markup.split(/\n+(?=APG recommends)/i).map((b) => b.trim()).filter(Boolean);
  if (blocks.length < 2) return { standard: markup };
  const [a, b] = blocks;
  return a.length >= b.length ? { standard: a, compact: b } : { standard: b, compact: a };
}

// A deck is read (30-80 MB off the network drive) once per version of the file: kept by path and
// last-modified time, so an edited deck -- a tech rep fixing their I&A, say -- is read again.
const deckReads = new Map<string, Promise<PriorDraft>>();

export async function readPriorDraft(prior: PriorReport): Promise<PriorDraft> {
  const stat = await fs.stat(toLongPath(prior.file));
  const key = `${prior.file}|${stat.mtimeMs}|${stat.size}`;
  let read = deckReads.get(key);
  if (!read) {
    read = readPriorDraftNow(prior);
    read.catch(() => deckReads.delete(key));
    deckReads.set(key, read);
  }
  return read;
}

// How a deck titles its summary and recommendations slides: most tech reps write "Engineering
// Summary" / "Repair Recommendations"; Jon Slater's stator decks (16963, 19719) split the summary
// over "I&A Summary", "I&A FPI & Visual Inspection Summary" and "I&A Dimensional Inspection
// Summary", and title the list "Engineering Recommended Repairs".
const SUMMARY_TITLE = /engineering\s*summary|^i\s*&\s*a\b.*summary/i;
const RECOMMENDATIONS_TITLE = /repair\s*recommendation|recommended\s*repairs/i;

async function readPriorDraftNow(prior: PriorReport): Promise<PriorDraft> {
  // A report this app built: everything is in its record, word for word.
  if (/\.pdf$/i.test(prior.file)) {
    const record = await readReportRecord(prior.file);
    if (!record) throw new Error(`No report record in ${prior.file}`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { version, jobNumber, reportType, ...draft } = record;
    return { source: prior, ...draft };
  }
  const slides = await readDeck(await fs.readFile(toLongPath(prior.file)));
  const recs = splitRecommendations(sectionMarkup(slides, RECOMMENDATIONS_TITLE));
  return {
    source: prior,
    engineeringSummary: sectionMarkup(slides, SUMMARY_TITLE),
    repairRecommendations: recs.standard,
    repairRecommendationsCompact: recs.compact,
    repairSummary: sectionMarkup(slides, /repair\s*summary/i),
    coverFields: coverFields(slides),
    coverLabels: coverLabels(slides),
    dividers: dividerTitles(slides),
    photoTitles: [...new Set(slides.filter((s) => !s.hidden && s.pictures >= 2).map(slideTitle).filter(Boolean))],
    ...(() => {
      const cover = coverValues(slides);
      return { coverValues: cover.values, coverLabelsExact: cover.labels, assetWithPO: cover.assetWithPO };
    })(),
  };
}
