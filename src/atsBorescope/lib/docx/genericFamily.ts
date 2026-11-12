import { extractText, findHeadingParagraph, findParagraphStart, findPhotosHeading } from "./xmlTextUtils";
import type { PhotosSection } from "./photosSectionMap";
import type { TemplateFamily } from "./templateFamilies";
import { componentKind, KIND_FALLBACKS, sectionKind, type SectionKind } from "./sectionKinds";

/** Every paragraph styled `styleId` between [from, to), with its text, in document order. */
export function listHeadings(xml: string, styleId: "Heading1" | "Heading2", from: number, to: number): Array<{ text: string; paragraphStart: number }> {
  const out: Array<{ text: string; paragraphStart: number }> = [];
  const styleTag = new RegExp(`<w:pStyle w:val="${styleId}"`, "g");
  styleTag.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = styleTag.exec(xml)) && m.index < to) {
    const start = findParagraphStart(xml, m.index);
    const end = xml.indexOf("</w:p>", m.index);
    const text = extractText(xml, start, end).replace(/\s+/g, " ");
    if (text) out.push({ text, paragraphStart: start });
  }
  return out;
}

/**
 * A layout read from the template itself, for every model that isn't one of the two GE families
 * (501D5A, 501F, 501G, W251, Frame 6, 7B, LM6000, V84, ...): its Photos subsections are simply
 * every Heading2 under its "Photos" heading, in order, and photos are sorted into them by kind
 * (sectionKinds.ts) -- what ATS's own past reports did with each component, then keyword rules.
 *
 * Headings no photo kind maps to (Operational Data, Data Plate, one-off sections) are still listed,
 * so the assembler's splice boundaries stay right, but are "manual": nothing is sorted into them and
 * their template content is left alone. Inlet sections are manual when empty too, as in the GE
 * families -- the borescope rarely photographs them, and the template's own examples stay put.
 */
export function buildGenericFamily(documentXml: string): TemplateFamily | null {
  const photos = findPhotosHeading(documentXml, 0);
  if (!photos) return null;
  // To the body's own closing section properties -- not the first <w:sectPr> after Photos, which can
  // be a mid-document section break (a landscape page) with more Photos headings after it.
  // From the end of the photos heading itself, which is a Heading2 in some templates.
  const headings = listHeadings(documentXml, "Heading2", photos.paragraphEnd, documentXml.length);
  // The same heading text twice would collapse in the assembler's lookup -- keep the first.
  const seen = new Set<string>();
  const sections = headings.map((h) => h.text).filter((t) => !seen.has(t) && seen.add(t));
  if (sections.length === 0) return null;

  const kindOf = new Map(sections.map((s) => [s, sectionKind(s)] as const));
  // Every section of each kind, in order -- a model can have several (GG4/Trent/RB211: low-,
  // intermediate- and high-pressure compressor and turbine sections; generators: turbine end and
  // exciter end).
  const byKind = new Map<SectionKind, PhotosSection[]>();
  for (const s of sections) {
    const k = kindOf.get(s)!;
    if (k !== "other") byKind.set(k, [...(byKind.get(k) ?? []), s]);
  }
  if (byKind.size === 0) return null;

  // Observations headings, for removing a section's table along with its photos.
  const obs = findHeadingParagraph(documentXml, "Heading1", "Observations", 0);
  const obsHeadings = obs ? listHeadings(documentXml, "Heading2", obs.paragraphStart, photos.paragraphStart) : [];
  const observationsHeadingBySection: Partial<Record<PhotosSection, string>> = {};
  for (const s of sections) {
    const k = kindOf.get(s)!;
    if (k === "other") continue;
    const match = obsHeadings.find((h) => sectionKind(h.text) === k);
    if (match) observationsHeadingBySection[s] = match.text;
  }

  const classify = (component: string): PhotosSection | null => {
    const kind = componentKind(component);
    if (!kind) return null;
    for (const k of [kind, ...KIND_FALLBACKS[kind]]) {
      const candidates = byKind.get(k);
      if (candidates?.length) return candidates.length === 1 ? candidates[0] : closestHeading(component, candidates);
    }
    return null;
  };

  return {
    id: "generic",
    label: `Read from the template (${sections.filter((x) => kindOf.get(x) !== "other").join(" / ")})`,
    photosSubsectionSpecs: sections.map((section) => ({ section })),
    observationsHeadingBySection,
    classify,
    manualWhenEmpty: new Set(sections.filter((s) => kindOf.get(s) === "other" || kindOf.get(s) === "inlet")),
    kindOf: (section: PhotosSection) => kindOf.get(section) ?? "other",
  };
}

// Words that tell same-kind sections apart, with the abbreviations ATS's component names use.
const QUALIFIERS: Array<[RegExp, string]> = [
  [/\b(hp|hpc|hpt|high pressure|high)\b/, "high"],
  [/\b(ip|ipc|ipt|intermediate pressure|intermediate)\b/, "intermediate"],
  [/\b(lp|lpc|lpt|low pressure|low)\b/, "low"],
  [/\bpower turbine\b|\bpt\b/, "power"],
  [/\bfree turbine\b|\bft\b/, "free"],
  [/\bgas generator\b|\bgg\b/, "gas-generator"],
  [/\bexciter\b|\bcollector\b/, "exciter"],
  [/\bturbine end\b|\bte\b/, "turbine-end"],
];
const qualifiers = (s: string) => new Set(QUALIFIERS.filter(([re]) => re.test(s.toLowerCase())).map(([, q]) => q));

/** Of several sections of the same kind, the one whose qualifiers (high/low/intermediate
 *  pressure, power turbine, exciter/turbine end) the component shares -- the first one otherwise. */
function closestHeading(component: string, candidates: PhotosSection[]): PhotosSection {
  const want = qualifiers(component);
  if (want.size === 0) return candidates[0];
  return candidates.find((c) => [...qualifiers(c)].some((q) => want.has(q))) ?? candidates[0];
}
