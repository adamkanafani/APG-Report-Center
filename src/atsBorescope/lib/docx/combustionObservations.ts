import type { RawPhotoUnit } from "./rawMdiParser";
import { buildCellReplacement } from "./observationsFiller";
import { componentKind } from "./sectionKinds";
import { extractText, findCellsInRange, findRowsInRange } from "./xmlTextUtils";

/**
 * The GE templates' Combustion Observations tables (7EA, 6B, Frame 5, ...): one block per
 * combustor position, "Position N | Inspection Access Provided | ...", then one row per part --
 * hot side: Combustion Cap, Fuel Nozzles, Crossfire Tubes, Combustion Liner, Transition Piece;
 * cold side: Outer Mount Brackets, Outer/Inner Zipper Weld, Inner Mount Bracket, Bull Horn Bracket.
 *
 * Each combustion photo is filed by its position ("Position 4"; a crossfire tube or side seal
 * between two cans, "2-3", goes under the first) and its part, and worded the way ATS's past 7EA
 * reports word these rows ("Coating loss at the upstream liner", "Coating loss at the transition
 * mouth", "Coating loss near the side seal"). Typical photos make a row "No defects identified".
 */

export type CombustionSide = "hot" | "cold";

const HOT_ROWS: Array<[RegExp, string]> = [
  [/\bcap\b/, "combustion cap"],
  [/fuel nozzle/, "fuel nozzle"],
  [/crossfire|cross fire|crossflame/, "crossfire tube"],
  [/liner|venturi|dilution/, "combustion liner"],
  [/transition|\btp\b|picture frame|side seal|floating seal/, "transition piece"],
];
const COLD_ROWS: Array<[RegExp, string]> = [
  [/outer mount/, "outer mount bracket"],
  [/outer zipper/, "outer zipper weld"],
  [/inner zipper/, "inner zipper weld"],
  [/inner mount/, "inner mount bracket"],
  [/bull ?horn/, "bull horn bracket"],
];

/** A template row label or a photo's part, in one comparable form: "Fuel Nozzles" -> "fuel nozzle". */
const rowKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "")
    .replace(/brackets$/, "bracket");

function partOf(component: string): { side: CombustionSide; row: string } | null {
  const c = component.toLowerCase();
  for (const [re, row] of COLD_ROWS) if (re.test(c)) return { side: "cold", row };
  for (const [re, row] of HOT_ROWS) if (re.test(c)) return { side: "hot", row };
  return null;
}

/** Where on the part, worded as ATS does -- or "" when the part itself is the location. */
function qualifier(component: string, location: string, pair: string | null): string {
  const c = component.toLowerCase();
  if (/crossfire|cross fire|crossflame/.test(c)) {
    const interior = /interior/.test(c) ? " interior" : "";
    return pair ? `at the crossfire tube${interior} between liners ${pair}` : interior ? "at the crossfire tube interior" : "";
  }
  if (/up ?stream/.test(c)) return "at the upstream liner";
  if (/down ?stream/.test(c)) return "at the downstream liner";
  if (/transition mouth|\bmouth\b/.test(c)) return "at the transition mouth";
  if (/side seal/.test(c)) return pair ? `near the side seal between transition pieces ${pair}` : "near the side seal";
  if (/picture frame/.test(c)) return /left/.test(c) ? "at the left side picture frame" : /right/.test(c) ? "at the right side picture frame" : "at the picture frame";
  if (/inner floating seal/.test(c)) return "at the inner floating seal";
  if (/outer floating seal/.test(c)) return "at the outer floating seal";
  if (/floating seal/.test(c)) return "at the floating seal";
  void location;
  return "";
}

const sentenceCase = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** "side|position|row" -> condition text, for every combustion photo's position and part. */
export function combustionFindings(units: RawPhotoUnit[]): Map<string, string> {
  type Cell = { typical: boolean; findings: Map<string, { label: string; where: string[] }> };
  const cells = new Map<string, Cell>();

  for (const u of units) {
    if (!u.component) continue;
    const kind = componentKind(u.component);
    if (kind !== "combustion" && kind !== "combustion-hot" && kind !== "combustion-cold") continue;
    const part = partOf(u.component);
    if (!part) continue;
    const loc = (u.location ?? "").trim();
    const pos = loc.match(/position\s*(\d+)/i) ?? loc.match(/^(\d+)\s*-\s*(\d+)$/) ?? loc.match(/^(\d+)$/);
    if (!pos) continue;
    const pair = /^(\d+)\s*-\s*(\d+)$/.test(loc) ? loc.replace(/\s+/g, "") : null;
    const key = `${part.side}|${Number(pos[1])}|${part.row}`;
    const cell = cells.get(key) ?? cells.set(key, { typical: false, findings: new Map() }).get(key)!;

    const parts = (u.observation ?? "").split(/\s*,\s*/).filter(Boolean);
    const real = parts.filter((p) => !/^typical$/i.test(p));
    if (real.length === 0) {
      cell.typical = true;
      continue;
    }
    const where = qualifier(u.component, loc, pair);
    for (const p of real) {
      const label = sentenceCase(p);
      const f = cell.findings.get(label.toLowerCase()) ?? cell.findings.set(label.toLowerCase(), { label, where: [] }).get(label.toLowerCase())!;
      if (where && !f.where.includes(where)) f.where.push(where);
    }
  }

  const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
  const out = new Map<string, string>();
  for (const [key, cell] of cells) {
    if (cell.findings.size === 0) {
      out.set(key, "No defects identified");
      continue;
    }
    // Findings at the same place share it: "Disengaged from retainer clip, Burn damage at the
    // crossfire tube between liners 2-3".
    const byWhere = new Map<string, string[]>();
    for (const { label, where } of cell.findings.values()) {
      const w = where.length ? list(where) : "";
      (byWhere.get(w) ?? byWhere.set(w, []).get(w)!).push(label);
    }
    out.set(
      key,
      [...byWhere].map(([w, labels]) => (w ? `${labels.join(", ")} ${w}` : labels.join(", "))).join(", "),
    );
  }
  return out;
}

/** The template's own defaults for a row nobody has looked at yet. Anything else in a row the
 *  photos don't cover is the template's worked example (Position 1: "Disengaged crossfire tube
 *  between liners X-X", "X inch crack (X)") and must not be left in a finished report. */
const TEMPLATE_DEFAULT = /^(no defects identified|limited access\s*-?\s*no defects identified)$/i;

/**
 * Fills one side's Combustion table between [from, to). Rows with photos get their findings
 * (blue, like every value the app fills in); rows without photos keep the template's default --
 * except leftover worked-example text, which becomes "No defects identified" when this side had
 * photos at all. A side with no photos is left exactly as the template has it.
 */
export function fillCombustionTable(
  xml: string,
  from: number,
  to: number,
  side: CombustionSide,
  findings: Map<string, string>,
): { edits: Array<{ start: number; end: number; replacement: string }>; filled: string[] } {
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  const filled: string[] = [];
  const sideHasPhotos = [...findings.keys()].some((k) => k.startsWith(`${side}|`));
  if (!sideHasPhotos) return { edits, filled };
  const knownRows = new Set((side === "hot" ? HOT_ROWS : COLD_ROWS).map(([, r]) => r));

  let position: number | null = null;
  for (const row of findRowsInRange(xml, from, to)) {
    const cells = findCellsInRange(xml, row.start, row.end);
    if (cells.length < 2) continue;
    const first = extractText(xml, cells[0].start, cells[0].end).replace(/\s+/g, " ").trim();
    const pos = first.match(/Position\s*(\d+)\s*$/i);
    if (pos) {
      position = Number(pos[1]);
      continue;
    }
    if (position === null) continue;
    const row0 = rowKey(first);
    if (!knownRows.has(row0)) continue;
    const text = findings.get(`${side}|${position}|${row0}`);
    const current = extractText(xml, cells[1].start, cells[1].end).replace(/\s+/g, " ").trim();
    if (text !== undefined) {
      edits.push(buildCellReplacement(xml, cells[1], text));
      filled.push(`Position ${position} ${first}`);
    } else if (current && !TEMPLATE_DEFAULT.test(current)) {
      edits.push(buildCellReplacement(xml, cells[1], "No defects identified"));
    }
  }
  return { edits, filled };
}
