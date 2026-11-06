import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { loadDocx } from "@/atsBorescope/lib/docx/zip";
import { detectTemplateFamily } from "@/atsBorescope/lib/docx/templateFamilies";
import { listUploadedTemplates } from "@/atsBorescope/lib/docx/uploadedTemplates";

/** ATS's shared library of blank cover-page templates -- one per unit/job type (35 and
 *  growing), maintained outside this project so new templates show up here without a deploy.
 *  See templateFamilies.ts for which of these the assembler actually knows how to fill in;
 *  picking one it doesn't recognize fails clearly at scan time rather than guessing wrong. */
// Found under whoever is signed in, not one person's fixed path: the folder is synced (or added as a
// shortcut) from the "Strategy - Files" SharePoint library into each person's
// "OneDrive - Allied Power Group" folder. ATS_TEMPLATES_DIR in .env.local overrides the search.
const TEMPLATES_FOLDER = "ATS Cover Page Templates";

async function isDir(p: string) {
  return fs.stat(p).then((st) => st.isDirectory()).catch(() => false);
}

async function findTemplatesDir(): Promise<string | null> {
  const override = process.env.ATS_TEMPLATES_DIR?.trim();
  if (override) return (await isDir(override)) ? override : null;
  const home = os.homedir();
  for (const root of [path.join(home, "OneDrive - Allied Power Group"), home]) {
    // Usually <root>/Strategy - Files/ATS Reporting/ATS Cover Page Templates; any library or folder
    // one level down also works, so a differently named shortcut is still found.
    const direct = [path.join(root, "Strategy - Files", "ATS Reporting", TEMPLATES_FOLDER), path.join(root, "ATS Reporting", TEMPLATES_FOLDER), path.join(root, TEMPLATES_FOLDER)];
    for (const d of direct) if (await isDir(d)) return d;
    const level1 = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const a of level1) {
      if (!a.isDirectory()) continue;
      for (const d of [path.join(root, a.name, TEMPLATES_FOLDER), path.join(root, a.name, "ATS Reporting", TEMPLATES_FOLDER)]) {
        if (await isDir(d)) return d;
      }
    }
  }
  return null;
}

const NOT_FOUND =
  'Couldn\'t find ATS\'s "ATS Cover Page Templates" folder on this computer. In SharePoint, open Strategy - Files > ATS Reporting, ' +
  'click "Add shortcut to My files" (or Sync), let OneDrive finish, then come back to this step. Or upload a blank template below.';

interface TemplateOption {
  name: string;
  path: string;
}

/** Legacy Frame 7 unit variants (Frame 7, 7C, 7E, 7EA) share the same base report structure --
 *  grouped here so a raw file named for any one of them matches templates named for any other,
 *  instead of an exact-token match hiding a 7E raw file's own 7EA templates. 7FA is deliberately
 *  its own family (different Photos/Observations layout -- see templateFamilies.ts's
 *  FRAME_BEARING_FAMILY), so it's not in this group. No "Frame 7"/"7C"/plain-"7E" template exists
 *  in the library yet -- this just means one will be picked up correctly the day ATS adds it. */
const UNIT_TYPE_ALIAS_GROUPS: string[][] = [["7EA", "7E", "7C", "FRAME 7"]];

function unitAliasGroup(unit: string): string[] {
  const upper = unit.toUpperCase();
  return UNIT_TYPE_ALIAS_GROUPS.find((group) => group.includes(upper)) ?? [upper];
}

/** Curated list shown on the template-picker step, so the user doesn't have to browse folders
 *  and risk picking a finished sample report instead of a blank starter template. Only lists
 *  .docx files directly in the folder (no subfolders currently expected there).
 *
 *  With `?unit=`, narrows `templates` down further to the ones this raw file's own unit type
 *  actually needs and this app can actually fill in -- the full 35-template library mixes every
 *  job type ATS does (shim removal, TIL-specific one-offs, other frames) with every unit family,
 *  and most of that is irrelevant noise once you already know which raw file you're building
 *  from. Two filters, in order:
 *   1. Name match: only templates whose own name starts with the same unit-type token as the
 *      raw file (e.g. "7EA_Full_...docx" -> keep templates starting with "7EA "). Every raw
 *      export and every template ATS maintains follows this naming convention.
 *   2. Automation match: of those, only the ones detectTemplateFamily() actually recognizes --
 *      the name match alone still includes structurally unrelated one-off job templates (Shim
 *      Removal, TIL-specific inspections) that share the unit prefix but aren't borescope
 *      reports at all.
 *  `fullList` is always returned too (unfiltered, exactly what a bare GET would give), so the
 *  client can offer an escape hatch back to the complete library when this heuristic is wrong. */
export async function GET(request: NextRequest) {
  const unit = request.nextUrl.searchParams.get("unit");
  // Manually-uploaded templates (see uploadedTemplates.ts) are always shown alongside the
  // curated/full lists below, regardless of unit-type filtering -- there are usually only one or
  // two of them, and they're the tech rep's own explicit choice, not something to hide behind a
  // naming heuristic.
  const uploaded = await listUploadedTemplates();

  const TEMPLATES_DIR = await findTemplatesDir();
  if (!TEMPLATES_DIR) return NextResponse.json({ templates: [], fullList: [], uploaded, error: NOT_FOUND });

  try {
    const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
    const fullList: TemplateOption[] = entries
      // "Sample Report" files are finished examples kept for style reference, not blank
      // templates -- excluded here since assembling into one throws (no fillable placeholders).
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".docx") && !e.name.toLowerCase().includes("sample report"))
      .map((e) => ({ name: e.name, path: path.join(TEMPLATES_DIR, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

    if (!unit) {
      return NextResponse.json({ templates: fullList, fullList, uploaded, unit: null, matchedCount: 0 });
    }

    const aliasGroup = unitAliasGroup(unit);
    const unitMatches = fullList.filter((t) => aliasGroup.some((alias) => t.name.toUpperCase().startsWith(`${alias} `)));

    const automated: TemplateOption[] = [];
    for (const t of unitMatches) {
      try {
        const buffer = await fs.readFile(t.path);
        const loaded = await loadDocx(buffer);
        if (detectTemplateFamily(loaded.documentXml)) automated.push(t);
      } catch {
        // Unreadable/corrupt template -- skip it rather than fail the whole list.
      }
    }

    return NextResponse.json({ templates: automated, fullList, uploaded, unit, matchedCount: unitMatches.length });
  } catch (err) {
    return NextResponse.json({ templates: [], fullList: [], uploaded, error: err instanceof Error ? err.message : "Failed to list templates" });
  }
}
