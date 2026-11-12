import path from "path";
import { promises as fs } from "fs";
import { toLongPath } from "../util/longPath";
import { measureCoverLayout } from "../pdf/coverLayout";
import type { JobScanResult } from "../ingest/scanJobFolder";
import { loadJobState, mutateJobState, updateSectionStates, type JobState, type SectionState } from "../state/jobState";
import type { ReportTemplate } from "../report-templates/types";
import { sectionForTitle, titleKey } from "../report-templates/titles";
import {
  adaptPriorSummary,
  buildEngineeringSummaryDraft,
  buildRepairRecommendationsDraft,
  buildRepairSummaryDraft,
  recommendationsToSummary,
} from "./narrative";
import { findOwnReport, findPriorReport, readPriorDraft, type PriorDraft, type PriorReport } from "./priorReport";
import { selectBestPhotos } from "./photoSelect";
import { learnPhotoTitles, photoGroupOf } from "../pdf/photoGroups";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Automatic draft generation failed.";
}

// Which earlier report a job drafts from: the search walks a couple hundred job folders on the
// network drive, so its answer is kept per job for the server session. The deck itself is read
// through readPriorDraft, which re-reads it whenever the file changes.
const priorLookups = new Map<string, Promise<PriorReport | null>>();

function lookUp(scan: JobScanResult, kind: "ia" | "repair"): Promise<PriorReport | null> {
  const key = `${kind}|${scan.jobRoot}`;
  let p = priorLookups.get(key);
  if (!p) {
    p = findPriorReport(scan.jobRoot, scan.metadata, kind).catch(() => null);
    priorLookups.set(key, p);
  }
  return p;
}

export async function priorDraftFor(scan: JobScanResult): Promise<PriorDraft | null> {
  const prior = await lookUp(scan, "ia");
  return prior ? readPriorDraft(prior).catch(() => null) : null;
}

// The same lookup for the Repair Report's own layout (its divider titles / optional blocks come from
// the last same-product *Repair* Report deck, not the I&A one).
async function priorRepairDeckFor(scan: JobScanResult): Promise<PriorDraft | null> {
  const prior = await lookUp(scan, "repair");
  return prior ? readPriorDraft(prior).catch(() => null) : null;
}

/** For a Repair Report, this job's own I&A deck (null for an I&A report, or when there isn't one) --
 * looked for each time (one folder listing), read again whenever the tech rep edits it. */
export async function ownIaDraftFor(scan: JobScanResult, reportType: string): Promise<PriorDraft | null> {
  if (!/repair|final/i.test(reportType)) return null;
  const own = await findOwnReport(scan.jobRoot, scan.metadata.jobNumber, "ia").catch(() => null);
  return own ? readPriorDraft(own).catch(() => null) : null;
}

// Cover labels this app already has a field for (any author's wording) -- anything else on the last
// report's cover ("WO#" on Adan Aguirre's NRG covers) is added as a blank custom row to fill in.
const KNOWN_COVER_LABELS = new Set(
  [
    "customer", "customer po", "po", "unit", "unit #", "unit#", "part type", "apg job #", "apg job", "job", "date", "tech rep",
    "turbine model", "component", "part numbers", "part number", "quantity", "qty", "material", "coating", "prior repair",
    "prior repairs", "prior hours", "prior starts", "boxes", "current total hrs", "current starts", "incoming # of boxes",
    "prior job #'s", "prior jobs", "asset#", "asset #", "asset", "eq#", "eq #", "eq",
  ].map((l) => l.replace(/\s+/g, ""))
);

/** The exported PDF next to a report deck ("... IA Report REV.pptx" → "... IA Report REV.pdf"). */
async function pdfBeside(deckPath: string): Promise<string | null> {
  const dir = path.dirname(deckPath);
  const stem = path.basename(deckPath, path.extname(deckPath)).toLowerCase();
  const names = await fs.readdir(toLongPath(dir)).catch(() => [] as string[]);
  const pdf = names.find((n) => n.toLowerCase() === `${stem}.pdf`) ?? names.find((n) => n.toLowerCase().startsWith(stem) && n.toLowerCase().endsWith(".pdf"));
  return pdf ? path.join(dir, pdf) : null;
}

/** Fills in what the cover learns from the author -- its layout (coverLayout.ts), exact labels and
 * EQ# placement -- whenever it hasn't been yet: from this job's own I&A deck on a Repair Report,
 * else the last same-product report. */
async function learnCover(scan: JobScanResult, template: ReportTemplate): Promise<void> {
  const cover = (await loadJobState(scan.jobRoot)).sections.cover;
  // A layout measured before the app knew where the rows end (rows1Bottom) is measured again.
  const stale = cover?.coverLayout && cover.coverLayout.rows1Bottom === undefined;
  if (cover?.coverLayout && cover.fieldLabelsExact && !stale) return;
  const repair = /repair/i.test(template.reportType);
  const source = (await ownIaDraftFor(scan, template.reportType)) ?? (repair ? await priorRepairDeckFor(scan) : await priorDraftFor(scan));
  if (!source) return;
  const pdf = cover?.coverLayout && !stale ? null : /\.pdf$/i.test(source.source.file) ? source.source.file : await pdfBeside(source.source.file);
  const layout = pdf ? await measureCoverLayout(pdf) : null;
  await mutateJobState(scan.jobRoot, (state) => {
    const c = { ...state.sections.cover };
    // Labels learned before the layout was (an older read that missed a details page with no
    // "Customer:" row) are read again along with it.
    const relearn = !c.fieldLabelsExact || (!c.coverLayout && Boolean(layout));
    if (relearn && Object.keys(source.coverLabelsExact).length > 0) c.fieldLabelsExact = { ...c.fieldLabelsExact, ...source.coverLabelsExact };
    if ((!c.coverLayout || c.coverLayout.rows1Bottom === undefined) && layout) c.coverLayout = layout;
    if (c.assetWithPO === undefined) c.assetWithPO = source.assetWithPO;
    state.sections.cover = c;
  });
}

/**
 * Once per job and report type: take the layout conventions of the last same-product report of the
 * same type. Divider wording ("Flow Test", "Heat Treat Chart" -- see titles.ts), which optional
 * blocks that author includes (Certifications, Heat Treat Certification, the Repair Report's
 * repeated incoming blocks), "EQ#" vs "Asset#", and any extra cover rows ("WO#"). Vane and nozzle
 * reports differ mostly in exactly these, by author -- confirmed across Elmer Gomez's and Adan
 * Aguirre's vane decks (20381, 20387, 19820, 19714, 19886, 19608, 19168) vs Alfredo's 20564.
 */
async function seedLayout(scan: JobScanResult, template: ReportTemplate, prior: PriorDraft | null): Promise<void> {
  await mutateJobState(scan.jobRoot, (state) => {
    const rt = template.reportType;
    // "none" = no earlier report was found last time; try again (new part kinds, a newly finished job).
    if (state.layoutSeeded?.[rt] && !(state.layoutSeeded[rt] === "none" && prior)) return;
    state.layoutSeeded = { ...state.layoutSeeded, [rt]: prior ? `Job ${prior.source.jobNumber}` : "none" };
    if (prior) {
      const titles: Record<string, string> = { ...state.sectionTitles?.[rt] };
      for (const divider of prior.dividers) {
        const section = sectionForTitle(template.sections.filter((s) => s.divider), divider);
        if (!section) continue;
        if (titleKey(divider) !== titleKey(section.title) || divider !== section.title) titles[section.id] ??= divider;
        // An optional block the last report included starts out included here too.
        if (section.defaultExcluded && state.sections[section.id]?.excludeFromReport === undefined) {
          state.sections[section.id] = { ...state.sections[section.id], excludeFromReport: false };
        }
      }
      state.sectionTitles = { ...state.sectionTitles, [rt]: titles };

      const cover = { ...state.sections.cover };
      const eqLabel = prior.coverLabels.find((l) => /^(eq|asset)\s*#?$/i.test(l.trim()));
      if (eqLabel && !cover.fieldLabels?.assetNumber) cover.fieldLabels = { ...cover.fieldLabels, assetNumber: eqLabel.replace(/\s+/g, "") };
      const existing = new Set((cover.customFields ?? []).map((f) => f.label.toLowerCase().replace(/\s+/g, "")));
      const extra = prior.coverLabels.filter((l) => {
        const k = l.toLowerCase().replace(/\s+/g, "").replace(/:$/, "");
        return !KNOWN_COVER_LABELS.has(k) && !existing.has(k);
      });
      if (extra.length > 0) {
        cover.customFields = [...(cover.customFields ?? []), ...extra.map((label) => ({ id: `seed-${label.replace(/[^A-Za-z0-9]/g, "")}`, label, value: "" }))];
      }
      // His photo page titles for this job's photo folders ("NDT Photos (Upstream ISOS)").
      for (const section of scan.sections.filter((s) => s.generation === "llm-vision-select")) {
        const labels = section.matchedFiles.map((f) => photoGroupOf(f.relativePath).label);
        const learned = learnPhotoTitles(labels, prior.photoTitles);
        if (Object.keys(learned).length > 0) {
          state.sections[section.id] = { ...state.sections[section.id], photoGroupTitles: { ...learned, ...state.sections[section.id]?.photoGroupTitles } };
        }
      }
      // His exact cover labels ("Unit#", "Prior Repair:") and where he puts the EQ#.
      if (!cover.fieldLabelsExact) cover.fieldLabelsExact = prior.coverLabelsExact;
      if (cover.assetWithPO === undefined) cover.assetWithPO = prior.assetWithPO;
      state.sections.cover = cover;
    }
  });
}

const seededLabel = (prior: PriorDraft) => `Job ${prior.source.jobNumber} (${path.basename(prior.source.file)})`;

/** The inputs the router-based Engineering Summary skeleton needs, pulled from a scan. */
export function engineeringSummaryInputs(scan: JobScanResult) {
  const byId = new Map(scan.sections.map((s) => [s.id, s]));
  const summary = byId.get("engineeringSummary");
  const ndt = byId.get("incomingNdt");
  return {
    metadata: scan.metadata,
    router: summary?.parsedRouter,
    measurements: scan.measurements,
    dimFileNames: (byId.get("incomingDimensional")?.matchedFiles ?? []).map((f) => f.baseName.replace(/\.pdf$/i, "")),
    crackMapAvailable: (ndt?.matchedFiles ?? []).some((f) => /crack/i.test(f.baseName)),
    metSampleAvailable: byId.get("metallurgicalReport")?.status === "ready" || byId.get("metallurgicalReport")?.status === "needs-attention",
  };
}

type Draft = { content: string; seededFrom?: string };
const ownLabel = (own: PriorDraft) => `this job's I&A report (${path.basename(own.source.file)})`;

/** Engineering Summary: the last same-product report's wording with this job's values swapped in,
 * else the router-based skeleton. */
export function engineeringSummaryDraft(scan: JobScanResult, prior: PriorDraft | null, source: "auto" | "router" = "auto", own: PriorDraft | null = null): Draft {
  // A Repair Report repeats this job's own I&A findings word for word.
  if (source === "auto" && own?.engineeringSummary) return { content: own.engineeringSummary, seededFrom: ownLabel(own) };
  if (source === "auto" && prior?.engineeringSummary) {
    return { content: adaptPriorSummary(prior.engineeringSummary, scan.measurements), seededFrom: seededLabel(prior) };
  }
  return { content: buildEngineeringSummaryDraft(engineeringSummaryInputs(scan)) };
}

/** Repair Recommendations: the last same-product report's list (his own customer-facing wording),
 * else the repair router's op labels. */
export function repairRecommendationsDraft(scan: JobScanResult, prior: PriorDraft | null, source: "auto" | "router" = "auto", own: PriorDraft | null = null): Draft | null {
  if (source === "auto" && own?.repairRecommendations) return { content: own.repairRecommendations, seededFrom: ownLabel(own) };
  if (source === "auto" && prior?.repairRecommendations) return { content: prior.repairRecommendations, seededFrom: seededLabel(prior) };
  const router = scan.sections.find((s) => s.id === "repairRecommendations" || s.id === "repairSummary")?.parsedRouter;
  return router ? { content: buildRepairRecommendationsDraft(router) } : null;
}

/** Repair Summary: this job's own Repair Recommendations in the past tense (exactly how Alfredo
 * writes it), else the last same-product report's recommendations, else the repair router. */
export function repairSummaryDraft(
  scan: JobScanResult,
  state: JobState,
  prior: PriorDraft | null,
  source: "auto" | "router" = "auto",
  own: PriorDraft | null = null
): Draft | null {
  // This job's own finished I&A deck first -- it's the version that went to the customer, after
  // any edits made in PowerPoint (Job 20992) -- then the recommendations typed into this app.
  if (source === "auto" && own?.repairRecommendations) return { content: recommendationsToSummary(own.repairRecommendations), seededFrom: ownLabel(own) };
  const ownRecs = state.sections["repairRecommendations"]?.content?.trim();
  if (source === "auto" && ownRecs) return { content: recommendationsToSummary(ownRecs), seededFrom: "this job's Repair Recommendations" };
  if (source === "auto" && prior?.repairRecommendations) return { content: recommendationsToSummary(prior.repairRecommendations), seededFrom: seededLabel(prior) };
  const router = scan.sections.find((s) => s.id === "repairSummary")?.parsedRouter;
  return router ? { content: buildRepairSummaryDraft(router) } : null;
}

/** The Fleet Service (FS) version of Repair Recommendations / Repair Summary: the shorter list off
 * the deck's second Repair Recommendations slide (Calpine jobs -- see splitRecommendations), from
 * this job's own I&A deck first, else the last same-product report; the summary is that list in the
 * past tense. Null when neither deck has an FS list -- the FS version then prints the standard text. */
export function compactDraft(sectionId: string, state: JobState, prior: PriorDraft | null, own: PriorDraft | null): Draft | null {
  const src = own?.repairRecommendationsCompact ? own : prior?.repairRecommendationsCompact ? prior : null;
  const label = src === own && own ? ownLabel(own) : src ? seededLabel(src) : undefined;
  if (sectionId === "repairRecommendations") return src ? { content: src.repairRecommendationsCompact!, seededFrom: label } : null;
  if (sectionId === "repairSummary") {
    // Same order as repairSummaryDraft: this job's deck, then this app's FS recommendations.
    const jobsOwn = state.sections["repairRecommendations"]?.compactContent?.trim();
    if (!own?.repairRecommendationsCompact && jobsOwn) return { content: recommendationsToSummary(jobsOwn), seededFrom: "this job's FS Repair Recommendations" };
    return src ? { content: recommendationsToSummary(src.repairRecommendationsCompact!), seededFrom: label } : null;
  }
  return null;
}

/**
 * Runs once per job-folder scan to build the best-supported initial draft for every narrative and
 * photo section, so the tech rep opens to a draft to review rather than a row of empty boxes.
 * Narrative drafts start from the most recent finished report of the same product (see
 * priorReport.ts), with this job's measured values swapped in; without one, they fall back to the
 * router-based drafts. Only the photo set optionally calls a vision model. Never overwrites a
 * section a human has already touched (has content, a photo selection, or was acknowledged), so
 * re-running this on a rescan is safe. Patches are applied in one batched write.
 */
export async function autoDraftJob(scan: JobScanResult, template: ReportTemplate): Promise<void> {
  const jobRoot = scan.jobRoot;
  // Layout first (it's a separate state write, done once) -- the Repair Report learns from the last
  // Repair Report deck, the I&A from the last I&A deck.
  if (!(await loadJobState(jobRoot)).layoutSeeded?.[template.reportType]) {
    const layoutPrior = /repair/i.test(template.reportType) ? await priorRepairDeckFor(scan) : await priorDraftFor(scan);
    await seedLayout(scan, template, layoutPrior);
  }

  // The cover as the author lays it out: positions and sizes measured off their last report's PDF,
  // and their exact labels -- for a job set up before the app learned these, too.
  await learnCover(scan, template);

  const bySectionId = new Map(scan.sections.map((s) => [s.id, s]));
  const existingState = await loadJobState(jobRoot);

  const isUntouched = (id: string): boolean => {
    const s = existingState.sections[id];
    return !s?.content && !(s?.selectedPhotoPaths && s.selectedPhotoPaths.length > 0) && !s?.acknowledged;
  };
  const stamp = () => new Date().toISOString();

  type PatchEntry = [string, Partial<SectionState>] | null;
  const jobs: Array<Promise<PatchEntry> | PatchEntry> = [];
  const missingDataStep = (id: string, reason: string): PatchEntry => (isUntouched(id) ? [id, { draftError: reason }] : null);
  const asPatch = (id: string, draft: Draft | null, missingReason: string): PatchEntry =>
    draft ? [id, { content: draft.content, seededFrom: draft.seededFrom, draftError: undefined, lastGeneratedAt: stamp() }] : missingDataStep(id, missingReason);

  const narrativeIds = ["engineeringSummary", "repairRecommendations", "repairSummary"].filter((id) => bySectionId.has(id) && isUntouched(id));
  const prior = narrativeIds.length > 0 ? await priorDraftFor(scan) : null;
  // The Repair Report's first source is this job's own I&A deck: same engineering findings, its
  // recommendations restated in the past tense, its corrected cover.
  const own = await ownIaDraftFor(scan, template.reportType);
  // Parts that only ever get a Repair Report (ISOs, Job 20848 -- no I&A at all): no earlier I&A to
  // draft from, so the last same-part Repair Report stands in -- its engineering summary, and its
  // Repair Summary as written (already past tense).
  const priorRepair = !prior && narrativeIds.length > 0 && /repair/i.test(template.reportType) ? await priorRepairDeckFor(scan) : null;

  // Recommendations first: on a job drafted straight from the Repair Report, the Repair Summary
  // is built from the same recommendations text.
  const recsState = { ...existingState, sections: { ...existingState.sections } };
  if (narrativeIds.includes("engineeringSummary")) jobs.push(asPatch("engineeringSummary", engineeringSummaryDraft(scan, prior ?? priorRepair, "auto", own), ""));
  if (narrativeIds.includes("repairRecommendations")) {
    const draft = repairRecommendationsDraft(scan, prior, "auto", own);
    jobs.push(asPatch("repairRecommendations", draft, "No earlier report for this product and no repair router were found — draft this section manually."));
    if (draft) recsState.sections.repairRecommendations = { ...recsState.sections.repairRecommendations, content: draft.content };
  }
  if (narrativeIds.includes("repairSummary")) {
    const fromRepairReport = priorRepair?.repairSummary ? { content: priorRepair.repairSummary, seededFrom: seededLabel(priorRepair) } : null;
    jobs.push(
      asPatch(
        "repairSummary",
        repairSummaryDraft(scan, recsState, prior, "auto", own) ?? fromRepairReport,
        "No repair recommendations, earlier report or repair router were found — draft this section manually."
      )
    );
  }

  // Cover from this job's own I&A deck: every value the tech rep put there (customer site, PO,
  // serial #'s, material, coating, boxes, ...) fills a cover field nobody has set yet.
  if (own && !existingState.sections.cover?.acknowledged) {
    const fields = { ...existingState.sections.cover?.fields };
    let changed = false;
    const sameWords = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
    for (const [key, value] of Object.entries(own.coverValues)) {
      // Empty → the deck's value. The same words with different line breaks (saved before the app
      // read the author's breaks) → the deck's breaks. Anything the tech rep actually changed stays.
      if ((!fields[key]?.trim() && value.trim()) || (fields[key] !== value && sameWords(fields[key] ?? "", value))) {
        fields[key] = value;
        changed = true;
      }
    }
    const cover = existingState.sections.cover;
    if (changed || !cover?.fieldLabelsExact) {
      jobs.push(["cover", { fields, fieldLabelsExact: cover?.fieldLabelsExact ?? own.coverLabelsExact, assetWithPO: cover?.assetWithPO ?? own.assetWithPO }]);
    }
  }

  // Cover: the last report's full Tech Rep name ("Alfredo Resendiz T." where the router just says
  // "Alfredo T") and material, when this job hasn't set them -- same person, same product.
  if (!own && prior && !existingState.sections.cover?.acknowledged) {
    const fields = { ...existingState.sections.cover?.fields };
    const priorRep = prior.coverFields["Tech Rep"];
    const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    let changed = false;
    if (!fields.techRep && priorRep && (!scan.metadata.techRep || firstWord(priorRep) === firstWord(scan.metadata.techRep))) {
      fields.techRep = priorRep;
      changed = true;
    }
    if (!fields.material && !scan.metadata.material && prior.coverFields["Material"]) {
      fields.material = prior.coverFields["Material"];
      changed = true;
    }
    // Coating is the product's, like material: the last same-product report's coating was this
    // job's in 71 of 93 past jobs checked (Working Jobs 16000-21600).
    if (!fields.coating && !scan.metadata.coating && prior.coverValues?.coating) {
      fields.coating = prior.coverValues.coating!;
      changed = true;
    }
    // Hours / starts / prior repairs are this unit's own -- carried over only when the last report
    // wrote a standing answer rather than a figure ("See RDS sheet", "Not Provided", "--"): the
    // same as this job's in ~3 of 4 past jobs checked, and never a wrong number.
    for (const key of ["hours", "starts", "priorRepair"] as const) {
      const value = prior.coverValues?.[key];
      if (!fields[key] && !scan.metadata[key] && value && !/\d/.test(value)) {
        fields[key] = value;
        changed = true;
      }
    }
    if (changed) jobs.push(["cover", { fields }]);
  }

  // Whichever photo-set sections this template has -- "photoSet" (incoming-stage photos) and/or
  // "finalPhotoSet" (final-stage) -- see selectBestPhotos' preferredStage param.
  for (const [id, preferredStage] of [
    ["photoSet", "incoming"],
    ["finalPhotoSet", "final"],
  ] as const) {
    const photoSection = bySectionId.get(id);
    if (!photoSection) continue;
    if (photoSection.matchedFiles.length > 0) {
      if (isUntouched(id)) {
        jobs.push(
          selectBestPhotos(photoSection.matchedFiles, preferredStage)
            .then((result): PatchEntry => [id, { selectedPhotoPaths: result.includedPaths, content: result.raw, draftError: undefined, lastGeneratedAt: stamp() }])
            .catch((err): PatchEntry => [id, { draftError: errorMessage(err) }])
        );
      }
    } else {
      jobs.push(missingDataStep(id, "No photo folder was found for this job."));
    }
  }

  // The FS versions of the repair lists, for any that don't have one yet.
  const compactIds = ["repairRecommendations", "repairSummary"].filter((id) => bySectionId.has(id) && !existingState.sections[id]?.compactContent?.trim());
  const compactPrior = compactIds.length > 0 ? (prior ?? (await priorDraftFor(scan))) : null;
  const compactState = { ...existingState, sections: { ...existingState.sections } };
  const compactPatches: Record<string, string> = {};
  for (const id of compactIds) {
    const draft = compactDraft(id, compactState, compactPrior, own);
    if (!draft) continue;
    compactPatches[id] = draft.content;
    compactState.sections[id] = { ...compactState.sections[id], compactContent: draft.content };
  }

  const results = await Promise.all(jobs);
  const patches: Record<string, Partial<SectionState>> = Object.fromEntries(results.filter((e): e is [string, Partial<SectionState>] => e !== null));
  for (const [id, compactContent] of Object.entries(compactPatches)) patches[id] = { ...patches[id], compactContent };
  if (Object.keys(patches).length > 0) await updateSectionStates(jobRoot, patches);
}
