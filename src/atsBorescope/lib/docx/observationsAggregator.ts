import type { RawPhotoUnit } from "./rawMdiParser";
import type { PhotosSection } from "./photosSectionMap";

export type TurbineGroup = "Nozzles" | "Buckets" | "Shroud Blocks";

export interface TurbineStageEntry {
  stage: number;
  group: TurbineGroup;
  text: string;
}

export interface ObservationsAggregation {
  /** Row key (e.g. "R1", "S1", "VIGV", "EGV1") -> Condition text. */
  compressor: Map<string, string>;
  turbine: TurbineStageEntry[];
  /** Units classified as Compressor/Turbine (by the same classifier the Photos step uses)
   *  whose component still didn't match a known Observations row -- a real gap worth
   *  surfacing, unlike Combustion/Exhaust/Inlet units, which are silently out of scope for
   *  this pass and never appear here. */
  unmatched: RawPhotoUnit[];
}

const TYPICAL = "Typical";

/**
 * Maps a raw unit's `component` to a Compressor Observations table row key, or null if it
 * doesn't belong there (Combustion/Exhaust/Turbine components, or anything unrecognized).
 * See reference/phase1-source-analysis.md and the plan file for how these were derived from
 * the 47 real component values in the Batavia sample.
 */
export function compressorRowKey(component: string): string | null {
  let m = /^Stage (\d+) Rotor Blade$/.exec(component);
  if (m) return `R${m[1]}`;
  m = /^Stage (\d+) Stator Vane$/.exec(component);
  if (m) return `S${m[1]}`;
  if (component === "Variable Inlet Guide Vanes" || component === "Variable Inlet Guide Vane") return "VIGV";
  m = /^Exit Guide Vane (\d+)$/.exec(component);
  if (m) return `EGV${m[1]}`;
  return null;
}

/** Maps a raw unit's `component` to a Turbine Observations stage/group, or null. */
export function turbineRowKey(component: string): { stage: number; group: TurbineGroup } | null {
  let m = /^Stage (\d+) Nozzle$/.exec(component);
  if (m) return { stage: Number(m[1]), group: "Nozzles" };
  m = /^Stage (\d+) Bucket$/.exec(component);
  if (m) return { stage: Number(m[1]), group: "Buckets" };
  m = /^Stage (\d+) Shroud$/.exec(component);
  if (m) return { stage: Number(m[1]), group: "Shroud Blocks" };
  return null;
}

const sentenceCase = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase().replace(/\bo'clock\b|\bo’clock\b/g, "o’clock");
};

/**
 * One Observations condition, worded the way ATS's own reports word it (checked against ~1,500
 * past reports in T:\!Jobs!\Working Jobs\400000 (ATS)): the observation in sentence case, then
 * "at the" and each location it was seen at -- "Impact damage at the leading edge (2)", "Coating
 * loss at the leading edge and at the trailing edge" -- in the raw file's own front-to-back order.
 * `counts` adds the number of photos in parentheses, as ATS does in compressor rows (including
 * "(1)"). "Typical" photos are left out; nothing left reads "No defects identified". Still blue
 * in the report for the tech rep to review, like everything the app fills in.
 */
export function aggregateConditionText(units: RawPhotoUnit[], options: { counts?: boolean } = {}): string {
  const nonTypical = units.filter((u) => u.observation && !/^typical$/i.test(u.observation.trim()));
  if (nonTypical.length === 0) return "No defects identified";

  const byObservation = new Map<string, { label: string; locations: string[]; count: number }>();
  for (const unit of nonTypical) {
    const label = sentenceCase(unit.observation as string);
    const key = label.toLowerCase();
    const entry = byObservation.get(key) ?? byObservation.set(key, { label, locations: [], count: 0 }).get(key)!;
    entry.count++;
    const location = unit.location?.trim().replace(/\s+/g, " ").toLowerCase();
    if (location && !entry.locations.includes(location)) entry.locations.push(location);
  }

  return [...byObservation.values()]
    .map(({ label, locations, count }) => {
      const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
      // The raw observation sometimes already ends "at the"/"on the" ("Grind Marks At The" + "Tip"),
      // or already says where ("Rub marks at 6 o'clock", "Discoloration at the tip") -- ATS leaves
      // those as they are rather than adding the photo's location on top.
      const joined = /\b(at|on|in) the$/i.test(label)
        ? `${label} ${list(locations)}`
        : / (at|on|in) /i.test(label) || locations.length === 0
          ? label
          : `${label} ${list(locations.map((l) => `at the ${l}`))}`;
      return options.counts ? `${joined} (${count})` : joined;
    })
    .join(", ");
}

/**
 * `classify` decides which raw units are in scope for "unmatched" reporting -- a component the
 * family classifier puts in Compressor/Turbine Section but that neither row-key regex below
 * recognizes is a real gap worth surfacing. Row-key matching itself is tried on every unit
 * regardless of which Photos subsection it was classified into: a family that gives Variable
 * Inlet Guide Vanes its own Photos bucket (see templateFamilies.ts) still reports that unit's
 * condition through the Compressor Section Observations table's own "VIGV" row, same as a
 * family with no separate VIGV bucket at all.
 */
export function aggregateObservations(units: RawPhotoUnit[], classify: (component: string) => PhotosSection | null): ObservationsAggregation {
  const compressorGroups = new Map<string, RawPhotoUnit[]>();
  const turbineGroups = new Map<string, RawPhotoUnit[]>(); // key: `${stage}:${group}`
  const turbineMeta = new Map<string, { stage: number; group: TurbineGroup }>();
  const unmatched: RawPhotoUnit[] = [];

  for (const unit of units) {
    if (!unit.component) continue;

    const compressorKey = compressorRowKey(unit.component);
    if (compressorKey) {
      if (!compressorGroups.has(compressorKey)) compressorGroups.set(compressorKey, []);
      compressorGroups.get(compressorKey)!.push(unit);
      continue;
    }
    const turbine = turbineRowKey(unit.component);
    if (turbine) {
      const key = `${turbine.stage}:${turbine.group}`;
      if (!turbineGroups.has(key)) {
        turbineGroups.set(key, []);
        turbineMeta.set(key, turbine);
      }
      turbineGroups.get(key)!.push(unit);
      continue;
    }

    const section = classify(unit.component);
    if (section === "Compressor Section" || section === "Turbine Section") unmatched.push(unit); // a real gap
    // else: out of scope (Combustion/Exhaust/Inlet/Bearing Area/etc.), not a gap.
  }

  const compressor = new Map<string, string>();
  for (const [key, groupUnits] of compressorGroups) {
    compressor.set(key, aggregateConditionText(groupUnits, { counts: true }));
  }

  const turbine: TurbineStageEntry[] = [];
  for (const [key, groupUnits] of turbineGroups) {
    const meta = turbineMeta.get(key)!;
    turbine.push({ stage: meta.stage, group: meta.group, text: aggregateConditionText(groupUnits) });
  }

  return { compressor, turbine, unmatched };
}
