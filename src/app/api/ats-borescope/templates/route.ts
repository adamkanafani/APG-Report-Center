import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { loadDocx } from "@/atsBorescope/lib/docx/zip";
import { familyForTemplate } from "@/atsBorescope/lib/docx/templateFamilies";
import { listUploadedTemplates } from "@/atsBorescope/lib/docx/uploadedTemplates";

/** ATS's shared library of blank cover-page templates -- one per unit/job type (35 and
 *  growing), maintained outside this project so new templates show up here without a deploy.
 *  See templateFamilies.ts for which of these the assembler actually knows how to fill in;
 *  picking one it doesn't recognize fails clearly at scan time rather than guessing wrong. */
// Where it is differs per computer, so it's looked for in order:
//  1. the folder picked on this computer with "Choose templates folder..." (saved in SETTINGS_FILE),
//  2. ATS_TEMPLATES_DIR in .env.local,
//  3. the signed-in person's OneDrive (synced or shortcut from Strategy - Files > ATS Reporting),
//  4. any drive plugged in or mapped (D: to Z:): the field techs carry their job files and
//     templates on a physical drive.
const TEMPLATES_FOLDER = "ATS Cover Page Templates";
// ATS's SharePoint Inspection Center (synced or added as a OneDrive shortcut): one folder per OEM
// and model, each with its own "Cover Page" folder holding that model's blank template -- every
// model ATS inspects, where the flat ATS Cover Page Templates folder only has some.
const INSPECTION_CENTER = "____ Inspection Center";
const SETTINGS_FILE = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "APGReportCenter", "ats-borescope.json");

async function isDir(p: string) {
  return fs.stat(p).then((st) => st.isDirectory()).catch(() => false);
}

async function savedTemplatesDir(): Promise<string | null> {
  const saved = await fs.readFile(SETTINGS_FILE, "utf8").then((t) => JSON.parse(t).templatesDir as string).catch(() => null);
  return saved && (await isDir(saved)) ? saved : null;
}

/** The folder directly in `root`, or one level down (e.g. E:\ATS\ATS Cover Page Templates). One
 * directory listing per folder, so even a big mapped drive is quick. */
async function findUnder(root: string, depth: number): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const hit = entries.find((e) => e.isDirectory() && [TEMPLATES_FOLDER, INSPECTION_CENTER].some((n) => e.name.toLowerCase() === n.toLowerCase()));
  if (hit) return path.join(root, hit.name);
  if (depth === 0) return null;
  for (const e of entries.slice(0, 300)) {
    if (!e.isDirectory() || e.name.startsWith("$") || e.name.startsWith(".")) continue;
    const found = await findUnder(path.join(root, e.name), depth - 1);
    if (found) return found;
  }
  return null;
}

/** A folder named `name` at most `depth` levels under `root` (SharePoint shortcuts land a level or
 *  two down, e.g. "ATS - Documents/Resource Center/____ Inspection Center"). */
async function findNamed(root: string, name: string, depth: number): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const hit = entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (hit && (await isDir(path.join(root, hit.name)))) return path.join(root, hit.name);
  if (depth === 0) return null;
  for (const e of entries.slice(0, 300)) {
    if (e.name.startsWith(".") || e.name.startsWith("$") || /\.\w{2,4}$/.test(e.name)) continue;
    const p = path.join(root, e.name);
    if (!(await isDir(p))) continue;
    const found = await findNamed(p, name, depth - 1);
    if (found) return found;
  }
  return null;
}

/** Every blank template in a folder: the .docx files directly in it (a flat folder like ATS Cover
 *  Page Templates), plus -- for the Inspection Center's OEM/Model/Cover Page layout -- the .docx
 *  files in any "Cover Page" folder up to three levels down, labeled with their model folder.
 *  Archives, sample reports and anything else are left out. */
async function listTemplates(dir: string): Promise<TemplateOption[]> {
  const out: TemplateOption[] = [];
  const isBlank = (n: string) => n.toLowerCase().endsWith(".docx") && !n.startsWith("~$") && !/sample report/i.test(n);
  const walk = async (d: string, depth: number, model: string | null) => {
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const p = path.join(d, e.name);
      const isFolder = await isDir(p);
      if (!isFolder) {
        if (isBlank(e.name) && (depth === 0 || /^cover pages?$/i.test(path.basename(d)))) out.push({ name: model ? `${model}: ${e.name}` : e.name, path: p, model: model ?? undefined });
        continue;
      }
      if (depth >= 3 || /archive|sample report|^mdi$|procedure|^til$|unit (photos|prep|specifications)/i.test(e.name)) continue;
      // The model is the folder that holds "Cover Page" (e.g. "501D5 _501D5A").
      await walk(p, depth + 1, /^cover pages?$/i.test(e.name) ? path.basename(d) : model);
    }
  };
  await walk(dir, 0, null);
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

async function remember(dir: string) {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify({ templatesDir: dir }, null, 2));
}

async function findTemplatesDir(): Promise<string | null> {
  const saved = await savedTemplatesDir();
  if (saved) return saved;
  const override = process.env.ATS_TEMPLATES_DIR?.trim();
  if (override && (await isDir(override))) return override;
  const home = os.homedir();
  // The Inspection Center first: it has every model's template.
  for (const root of [path.join(home, "OneDrive - Allied Power Group"), home]) {
    const ic = await findNamed(root, INSPECTION_CENTER, 3);
    if (ic) return ic;
  }
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
  // Plugged-in and mapped drives, skipping C: (already covered above, and too big to walk).
  for (const letter of "DEFGHIJKLMNOPQRSTUVWXYZ") {
    const root = `${letter}:\\`;
    if (!(await isDir(root))) continue;
    const found = await findUnder(root, 1);
    if (found) {
      // Remembered, so the drives aren't searched again every time.
      await remember(found).catch(() => {});
      return found;
    }
  }
  return null;
}

const NOT_FOUND =
  'Couldn\'t find the "ATS Cover Page Templates" folder on this computer. Click "Choose templates folder..." below and pick it ' +
  "(on your OneDrive or the drive your job files are on). The app remembers it on this computer.";

/** "Choose templates folder...": remembers the picked folder on this computer. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const dir = typeof body.dir === "string" ? body.dir.trim() : "";
  if (!dir || !(await isDir(dir))) return NextResponse.json({ error: "That folder couldn't be opened." }, { status: 400 });
  if ((await listTemplates(dir)).length === 0) {
    return NextResponse.json({ error: "No blank Word templates (.docx) were found in that folder. Pick the folder the blank ATS templates are in, or the Inspection Center." }, { status: 400 });
  }
  await remember(dir);
  return NextResponse.json({ ok: true, dir });
}

interface TemplateOption {
  name: string;
  path: string;
  /** Inspection Center only: the model folder it came from, e.g. "501D5 _501D5A". */
  model?: string;
}

/** Legacy Frame 7 unit variants (Frame 7, 7C, 7E, 7EA) share the same base report structure --
 *  grouped here so a raw file named for any one of them matches templates named for any other,
 *  instead of an exact-token match hiding a 7E raw file's own 7EA templates. 7FA is deliberately
 *  its own family (different Photos/Observations layout -- see templateFamilies.ts's
 *  FRAME_BEARING_FAMILY), so it's not in this group. No "Frame 7"/"7C"/plain-"7E" template exists
 *  in the library yet -- this just means one will be picked up correctly the day ATS adds it. */
const UNIT_TYPE_ALIAS_GROUPS: string[][] = [["7EA", "7E", "7C", "FRAME 7"]];

function unitAliasGroup(unit: string): string[] {
  const upper = unit.toUpperCase().replace(/^W(?=\d)/, ""); // W501D5A -> 501D5A
  return UNIT_TYPE_ALIAS_GROUPS.find((group) => group.includes(upper)) ?? [upper];
}

/** Whether a template is for this unit type: its name starts with the unit ("7EA Borescope ..."),
 *  or its model folder / name has the unit as a word ("501D5 _501D5A" for 501D5A), or a word the
 *  unit ends with ("D5_D5A Borescope Cover Page" for 501D5A). */
function matchesUnit(t: TemplateOption, unit: string): boolean {
  const aliases = unitAliasGroup(unit);
  const file = path.basename(t.path).toUpperCase();
  if (aliases.some((a) => file.startsWith(`${a} `))) return true;
  const words = `${t.model ?? ""} ${file.replace(/\.DOCX$/, "")}`
    .toUpperCase()
    .split(/[\s_\-,&/()]+/)
    .map((w) => w.replace(/^W(?=\d)/, ""))
    .filter(Boolean);
  return aliases.some((a) => words.some((w) => w === a || (w.length >= 3 && /\d/.test(w) && a.endsWith(w))));
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
    // "Sample Report" files are finished examples kept for style reference, not blank templates.
    const fullList = await listTemplates(TEMPLATES_DIR);

    if (!unit) {
      return NextResponse.json({ templates: fullList, fullList, uploaded, unit: null, matchedCount: 0, dir: TEMPLATES_DIR });
    }

    const unitMatches = fullList.filter((t) => matchesUnit(t, unit));

    const automated: TemplateOption[] = [];
    for (const t of unitMatches) {
      try {
        const buffer = await fs.readFile(t.path);
        const loaded = await loadDocx(buffer);
        if (familyForTemplate(loaded.documentXml)) automated.push(t);
      } catch {
        // Unreadable/corrupt template -- skip it rather than fail the whole list.
      }
    }

    return NextResponse.json({ templates: automated, fullList, uploaded, unit, matchedCount: unitMatches.length, dir: TEMPLATES_DIR });
  } catch (err) {
    return NextResponse.json({ templates: [], fullList: [], uploaded, error: err instanceof Error ? err.message : "Failed to list templates" });
  }
}
