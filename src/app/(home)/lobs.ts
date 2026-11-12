// The lines of business on the home screen and the report builders under each. A builder with no
// href is shown as coming soon. Builders are plain links (not next/link): each builder has its own
// root layout and stylesheet, so moving between them is a full page load either way.

export type Builder = { name: string; covers: string; href?: string };
/** Each line's buttons wear the look of the apps behind them: APG blue, or the ATS black-and-red. */
export type Theme = "apg" | "ats";
export type Lob = { id: string; name: string; blurb: string; theme: Theme; builders: Builder[]; note?: string };

// Repair gets one button per part, so a tech picks what's on the bench; each opens the builder
// made for it -- Vanes & Nozzles or Buckets & Blades.
const VANES_NOZZLES = "/parts/vanes-nozzles";
const BUCKETS_BLADES = "/parts/buckets-blades";
const REPAIR_PARTS: Builder[] = [
  { name: "Nozzles", covers: "Turbine nozzles, every stage", href: VANES_NOZZLES },
  { name: "Vanes", covers: "Turbine vanes, every row", href: VANES_NOZZLES },
  { name: "Buckets", covers: "Turbine buckets", href: BUCKETS_BLADES },
  { name: "Blades", covers: "Compressor blades", href: BUCKETS_BLADES },
  { name: "Compressor Diaphragms", covers: "Diaphragms, stators and seal holders", href: VANES_NOZZLES },
  { name: "Blade Rings", covers: "Blade rings and ring segments", href: VANES_NOZZLES },
  { name: "ISOs & Air Seals", covers: "Isolation segments and seal housings", href: VANES_NOZZLES },
  { name: "Support Rings & Carriers", covers: "Inner support rings and vane carriers", href: VANES_NOZZLES },
];

export const LOBS: Lob[] = [
  {
    id: "repair",
    theme: "apg",
    name: "Repair",
    blurb: "I&A and Final reports for repaired parts",
    builders: REPAIR_PARTS,
  },
  {
    id: "field-service",
    theme: "apg",
    name: "Field Service",
    blurb: "Coming soon",
    builders: [],
  },
  {
    id: "inspection",
    theme: "ats",
    name: "Inspection",
    blurb: "ATS borescope reports",
    builders: [
      { name: "ATS Borescope Report Builder", covers: "Builds the ATS borescope report from the raw borescope file", href: "/inspection/borescope" },
      { name: "ATS Report Reviewer", covers: "Report reviewer only. Checks an inspector's ATS report before it goes out (sign-in required)", href: "/inspection/reviewer" },
    ],
  },
  {
    id: "generator",
    theme: "apg",
    name: "Generator",
    blurb: "Coming soon",
    builders: [],
  },
];

export const lobById = (id: string) => LOBS.find((l) => l.id === id);
