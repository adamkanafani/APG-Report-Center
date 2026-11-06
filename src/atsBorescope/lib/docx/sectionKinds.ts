import knowledge from "./componentKnowledge.json";

/**
 * What a report section is *about*, independent of how a given model's template words its
 * heading -- "Inlet Area" and "Inlet Section" are both `inlet`; "Combustion Section Hot Side" and
 * "Combustor Hot Side" are both `combustion-hot`. Lets one classifier serve every model's template
 * (genericFamily.ts): a photo's component is classified to a kind, and the kind to whichever of
 * this template's own headings has it.
 */
export type SectionKind =
  | "inlet"
  | "vigv"
  | "compressor"
  | "bearing"
  | "combustion-cold"
  | "combustion-hot"
  | "combustion"
  | "turbine"
  | "exhaust"
  | "generator"
  | "other";

/** A heading's kind, from its wording. "other" for headings no photo should be sorted into on its
 *  own (Operational Data, Data Plate, one-off TIL sections, ...). */
export function sectionKind(heading: string): SectionKind {
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

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/(\d) (?=\d)/g, "$1") // "Row 1 5 Rotor Blade" (a PDF text artifact) -> "row 15 rotor blade"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Ordered keyword rules: the first rule whose pattern matches wins. Built from the GE families'
 *  proven rules (templateFamilies.ts) widened with the component names ATS's other models use
 *  (Westinghouse/Siemens "Row N Diaphragm", "Basket", "Pilot Nozzle", "Rocket", "Ring Segment",
 *  aeroderivative "HPC/LPT", ...). Turbine is checked before compressor for names that say
 *  "Turbine" outright, since "Turbine Row 1 Blade" would otherwise look like a compressor blade. */
const RULES: Array<{ kind: SectionKind; pattern: RegExp }> = [
  { kind: "generator", pattern: /generator|exciter|end winding|collector ring|retaining ring/ },
  { kind: "vigv", pattern: /variable inlet guide vane|\bvigv\b|\bigv\b|inlet guide vane/ },
  { kind: "bearing", pattern: /number (1|one) bearing|no 1 bearing|#1 bearing/ },
  { kind: "turbine", pattern: /\bturbine\b|\bhpt\b|\blpt\b|power turbine/ },
  { kind: "inlet", pattern: /\binlet\b(?!.*guide)|\bintake\b|bellmouth|\bfloor\b|silencer|inlet filter/ },
  { kind: "compressor", pattern: /rotor blade|stator vane|diaphragm|compressor|\begv\b|exit guide vane|outlet guide vane|\bogv\b|\bhpc\b|\blpc\b|dovetail|\bigv\b/ },
  {
    kind: "combustion-cold",
    pattern:
      /cold side|combustion casing|\bcdc\b|quaternary|outer (aft )?mount(ing)? bracket|outer zipper weld|bull ?horn|spool bolt|impingement sleeve|basket clamp|forward mounting bracket|aft mounting bracket/,
  },
  {
    kind: "combustion-hot",
    pattern:
      /fuel nozzle|pilot nozzle|rocket|effusion|igniter|ignitor|crossfire|crossflame|cross flame|\bliner\b|\bbasket\b|transition|\btp\b|venturi|\bdln\b|picture frame|floating seal|side seal|inner (aft )?mount|inner zipper|steam distributor|flame scanner|combust|\bcap\b|swirler|burner|\bcan\b|dome/,
  },
  { kind: "turbine", pattern: /nozzle|bucket|shroud|ring segment|honeycomb|\bvane\b|\bblade\b/ },
  { kind: "exhaust", pattern: /exhaust|flex seal|\bstrut\b|diffuser|barrel|baffle|\bcylinder\b|\bplenum\b/ },
];

type Knowledge = { components: Record<string, Partial<Record<SectionKind, number>>> };
const learned = (knowledge as Knowledge).components;

/** A raw photo's component name -> the kind of section it belongs in. First what ATS's own past
 *  reports did with that exact component (componentKnowledge.json, learned from every report in
 *  the 400000 (ATS) job folders), then the keyword rules. */
export function componentKind(component: string): SectionKind | null {
  const key = norm(component);
  const seen = learned[key];
  if (seen) {
    const best = Object.entries(seen).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    if (best && best[0] !== "other") return best[0] as SectionKind;
  }
  for (const rule of RULES) if (rule.pattern.test(key)) return rule.kind;
  return null;
}

/** Where a kind goes when this template has no heading of that kind -- e.g. a template with a
 *  single "Combustion Section" takes both cold- and hot-side photos; VIGV photos go with the
 *  compressor when there's no VIGV heading of their own. */
export const KIND_FALLBACKS: Record<SectionKind, SectionKind[]> = {
  inlet: [],
  vigv: ["compressor"],
  compressor: [],
  bearing: ["compressor"],
  "combustion-cold": ["combustion", "combustion-hot"],
  "combustion-hot": ["combustion", "combustion-cold"],
  combustion: ["combustion-hot", "combustion-cold"],
  turbine: [],
  exhaust: [],
  generator: [],
  other: [],
};

export { norm as normalizeComponent };
