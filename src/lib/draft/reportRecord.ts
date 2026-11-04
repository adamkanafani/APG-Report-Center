import { promises as fs } from "fs";
import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import type { JobScanResult } from "../ingest/scanJobFolder";
import type { JobState } from "../state/jobState";
import { coverPages, sectionText } from "../pdf/renderReportHtml";
import { toLongPath } from "../util/longPath";
import type { PriorDraft } from "./priorReport";

// What a report the app built says about itself, for the next job of the same part to learn from:
// the tech rep's final wording, cover labels and values, divider and photo titles -- the same
// things the app used to read off their PowerPoint decks (priorReport.ts), which they no longer
// make. It rides inside the PDF itself (a key in its document info), so it travels wherever the
// file is saved: into the job's 7 Reports folder, where findPriorReport looks.

export type ReportRecord = Omit<PriorDraft, "source"> & { version: 1; jobNumber: string; reportType: string };

const KEY = "VNReportRecord";
// The info dictionary is among the first objects in the file (see writeReportRecord), so the start
// of the file is all that's ever read -- not the whole 20-80 MB report off the network drive.
const HEAD_BYTES = 2 * 1024 * 1024;

const COVER_KEYS = [
  "customer", "customerPO", "assetNumber", "unit", "part", "jobNumber", "date", "techRep", "detailsCustomer", "turbineModel",
  "component", "serialNumbers", "partNumbers", "quantity", "material", "coating", "priorRepair", "hours", "starts", "boxes",
];

/** The record for a report about to be saved, from the job state it was built from and its pages. */
export function buildReportRecord(scan: JobScanResult, state: JobState, html: string[]): ReportRecord {
  const cover = state.sections.cover;
  const { page1, page2 } = coverPages(scan, state);
  const rows = [...page1, ...page2];
  const bare = (label: string) => label.replace(/\s*:\s*$/, "").trim();
  const coverValues: Record<string, string> = {};
  for (const key of COVER_KEYS) {
    const value = (cover?.fields?.[key] ?? (scan.metadata as unknown as Record<string, unknown>)[key] ?? "").toString().trim();
    if (value) coverValues[key] = value;
  }
  const all = html.join("\n");
  const matches = (re: RegExp) => [...new Set([...all.matchAll(re)].map((m) => decodeHtml(m[1]).trim()).filter(Boolean))];
  const recs = sectionText({ variant: "standard" }, state, "repairRecommendations");
  const compact = state.sections.repairRecommendations?.compactContent?.trim();
  return {
    version: 1,
    jobNumber: scan.metadata.jobNumber ?? "",
    reportType: scan.reportType,
    engineeringSummary: sectionText({ variant: "standard" }, state, "engineeringSummary"),
    repairRecommendations: recs,
    repairRecommendationsCompact: compact || undefined,
    repairSummary: sectionText({ variant: "standard" }, state, "repairSummary"),
    coverFields: Object.fromEntries(rows.map((r) => [bare(r.label), r.value])),
    coverLabels: rows.map((r) => bare(r.label)),
    dividers: matches(/class="divider-title">([\s\S]*?)<\/div>/g),
    // Photo pages carry their group's title in the 24pt page header.
    photoTitles: matches(/font-size: 24pt; top: -1\.5pt">([\s\S]*?)<\/h1>/g),
    coverValues,
    coverLabelsExact: cover?.fieldLabelsExact ?? {},
    assetWithPO: Boolean(cover?.assetWithPO),
  };
}

const decodeHtml = (s: string) =>
  s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Puts the record in a new document's info dictionary. Call it right after PDFDocument.create()
 * and save with `useObjectStreams: false`, so the dictionary is written plainly near the top. */
export function writeReportRecord(doc: PDFDocument, record: ReportRecord): void {
  doc.setCreator("APG V&N Report Builder");
  // getInfoDict is private in pdf-lib's typings but is how custom keys are set.
  (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict().set(PDFName.of(KEY), PDFString.of(Buffer.from(JSON.stringify(record), "utf8").toString("base64")));
}

const reads = new Map<string, Promise<ReportRecord | null>>();

/** The record inside a report PDF the app built, or null for any other PDF. */
export async function readReportRecord(file: string): Promise<ReportRecord | null> {
  const stat = await fs.stat(toLongPath(file)).catch(() => null);
  if (!stat) return null;
  const key = `${file}|${stat.mtimeMs}|${stat.size}`;
  let read = reads.get(key);
  if (!read) {
    read = readNow(file);
    reads.set(key, read);
  }
  return read;
}

async function readNow(file: string): Promise<ReportRecord | null> {
  try {
    const handle = await fs.open(toLongPath(file), "r");
    try {
      const buf = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await handle.read(buf, 0, HEAD_BYTES, 0);
      const m = buf.subarray(0, bytesRead).toString("latin1").match(new RegExp(`/${KEY}\\s*\\(([A-Za-z0-9+/=]+)\\)`));
      if (!m) return null;
      const record = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")) as ReportRecord;
      return record?.version === 1 ? record : null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}
