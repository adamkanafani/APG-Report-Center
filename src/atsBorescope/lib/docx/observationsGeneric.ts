import { extractText, findCellsInRange, findHeadingParagraph, findRowsInRange, findPhotosHeading } from "./xmlTextUtils";
import type { RawPhotoUnit } from "./rawMdiParser";
import type { FillObservationsResult } from "./observationsFiller";
import { aggregateConditionText } from "./observationsAggregator";
import { buildCellReplacement, replaceAddApplicablePlaceholder } from "./observationsFiller";
import { listHeadings } from "./genericFamily";
import { componentKind, sectionKind } from "./sectionKinds";

const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The Observations-table row labels a compressor photo could be filed under, across the ways
 *  ATS's templates label rows: GE "R1"/"S1"/"VIGV"/"EGV1", Westinghouse/Siemens "R1B"/"R1D"/"IGV"/
 *  "OGV", and spelled-out "Row 1"/"Stage 1". */
function compressorRowKeys(component: string): string[] {
  const c = component.toLowerCase().replace(/(\d) (?=\d)/g, "$1");
  let m: RegExpMatchArray | null;
  if (/variable inlet guide vane|\bvigv\b|\bigv\b|inlet guide vane/.test(c)) return ["VIGV", "IGV"];
  if ((m = c.match(/exit guide vane\s*(\d+)/))) return [`EGV${m[1]}`];
  if (/exit guide vane|\begv\b/.test(c)) return ["EGV"];
  if (/outlet guide vane|\bogv\b/.test(c)) return ["OGV"];
  // Siemens V84: VLA = compressor blade row, VLE = compressor vane row ("VLA Row 1" -> table row "VLA 1").
  if ((m = c.match(/\bvl([ae])\s*(?:row)?\s*(\d+)/))) return [`VL${m[1].toUpperCase()}${m[2]}`];
  if ((m = c.match(/(?:stage|row|\br)\s*-?\s*(\d+)\s+(?:rotor\s+)?blade/))) return [`R${m[1]}`, `R${m[1]}B`, `ROW${m[1]}BLADES`, `STAGE${m[1]}BLADES`];
  if ((m = c.match(/(?:stage|row|\bs)\s*-?\s*(\d+)\s+(?:stator\s+vane|stator|diaphragm|vane)/))) return [`S${m[1]}`, `R${m[1]}D`, `ROW${m[1]}VANES`, `STAGE${m[1]}VANES`];
  return [];
}

type TurbineGroup = "vane" | "blade" | "shroud";
const turbineGroup = (word: string): TurbineGroup | null =>
  /nozzle|vane/i.test(word) ? "vane" : /bucket|blade/i.test(word) ? "blade" : /shroud|ring segment|honeycomb/i.test(word) ? "shroud" : null;

/** A turbine photo's "stage:group" key, e.g. "Turbine Row 1 Blade" -> "1:blade", "Stage 2 Nozzle" -> "2:vane". */
function turbineKey(component: string): string | null {
  // Siemens V84: TLE = turbine vane row, TLA = turbine blade row ("Turbine TLE Row 4").
  const v84 = component.match(/\btl([ae])\s*(?:row)?\s*(\d+)/i);
  if (v84) return `${v84[2]}:${v84[1].toLowerCase() === "e" ? "vane" : "blade"}`;
  const m = component.match(/(?:stage|row)\s*(\d+).*?(nozzle|vane|bucket|blade|shroud|ring segment|honeycomb)/i);
  if (!m) return null;
  const g = turbineGroup(m[2]);
  return g ? `${m[1]}:${g}` : null;
}

/**
 * Fills the Compressor and Turbine Observations tables of any model's template from the raw photo
 * units -- the same scope as the GE filler (observationsFiller.ts): Condition cells only, blue text,
 * Combustion/Exhaust and Percent-Inspected left for the tech rep. Never throws: a template whose
 * tables it doesn't recognize just gets nothing filled, and the photos still go in.
 */
export function fillObservationsGeneric(documentXml: string, units: RawPhotoUnit[]): FillObservationsResult {
  const xml = documentXml;
  const filled: string[] = [];
  const skipped: string[] = [];
  const obs = findHeadingParagraph(xml, "Heading1", "Observations", 0);
  const photos = findPhotosHeading(xml, 0);
  if (!obs || !photos) return { documentXml: xml, filled, skipped };

  // Group units by every row key / turbine key they could go under.
  const compressorUnits = new Map<string, RawPhotoUnit[]>();
  const turbineUnits = new Map<string, RawPhotoUnit[]>();
  for (const u of units) {
    if (!u.component) continue;
    const kind = componentKind(u.component);
    if (kind === "compressor" || kind === "vigv") {
      for (const k of compressorRowKeys(u.component)) (compressorUnits.get(k) ?? compressorUnits.set(k, []).get(k)!).push(u);
    } else if (kind === "turbine") {
      const k = turbineKey(u.component);
      if (k) (turbineUnits.get(k) ?? turbineUnits.set(k, []).get(k)!).push(u);
    }
  }

  const edits: { start: number; end: number; replacement: string }[] = [];
  const headings = listHeadings(xml, "Heading2", obs.paragraphStart, photos.paragraphStart);
  const usedCompressor = new Set<string>();
  const usedTurbine = new Set<string>();

  for (let i = 0; i < headings.length; i++) {
    const kind = sectionKind(headings[i].text);
    const from = headings[i].paragraphStart;
    const to = i + 1 < headings.length ? headings[i + 1].paragraphStart : photos.paragraphStart;
    const rows = findRowsInRange(xml, from, to);

    if (kind === "compressor" || kind === "vigv") {
      for (const row of rows) {
        const cells = findCellsInRange(xml, row.start, row.end);
        if (cells.length < 2) continue;
        const label = key(extractText(xml, cells[0].start, cells[0].end));
        const group = compressorUnits.get(label);
        if (!label || !group || usedCompressor.has(label)) continue;
        edits.push(buildCellReplacement(xml, cells[1], aggregateConditionText(group, { counts: true })));
        filled.push(label);
        usedCompressor.add(label);
      }
    } else if (kind === "turbine") {
      // Anchor rows ("Row 1 Vanes", "Stage 1 Buckets", "Row 1 Ring Segment"), then the first
      // "Condition" cell after it -- in the same row or the first cell of the next row.
      let current: string | null = null;
      for (let r = 0; r < rows.length; r++) {
        const cells = findCellsInRange(xml, rows[r].start, rows[r].end);
        if (cells.length === 0) continue;
        const first = extractText(xml, cells[0].start, cells[0].end);
        const anchor = first.match(/^(?:Stage|Row|TL[AE])\s*(\d+)\s+(.+)$/i); // "Row 1 Vanes", V84 "TLE 1 Vanes"
        if (anchor && cells.length === 1) {
          const g = turbineGroup(anchor[2]);
          current = g ? `${anchor[1]}:${g}` : null;
          continue;
        }
        if (/^condition$/i.test(first) && current) {
          const target = cells.length >= 2 ? cells[1] : r + 1 < rows.length ? findCellsInRange(xml, rows[r + 1].start, rows[r + 1].end)[0] : undefined;
          const group = turbineUnits.get(current);
          if (target && group && !usedTurbine.has(current)) {
            edits.push(buildCellReplacement(xml, target, aggregateConditionText(group)));
            filled.push(`Turbine ${current.replace(":", " ")}`);
            usedTurbine.add(current);
          }
          current = null;
        }
      }
    }
  }

  // Compressor photos whose every possible row key went unused had no row to go in.
  const reported = new Set<RawPhotoUnit>();
  for (const [k, group] of compressorUnits) {
    if (usedCompressor.has(k)) group.forEach((u) => reported.add(u));
  }
  for (const [, group] of compressorUnits) for (const u of group) if (!reported.has(u) && u.component) skipped.push(u.component);
  for (const k of turbineUnits.keys()) if (!usedTurbine.has(k)) skipped.push(`Turbine ${k.replace(":", " ")}`);

  edits.sort((a, b) => b.start - a.start);
  let result = xml;
  for (const { start, end, replacement } of edits) result = result.slice(0, start) + replacement + result.slice(end);
  result = replaceAddApplicablePlaceholder(result, obs.paragraphStart);
  return { documentXml: result, filled, skipped: [...new Set(skipped)] };
}
