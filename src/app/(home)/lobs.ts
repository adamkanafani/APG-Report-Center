// The lines of business on the home screen and the report builders under each. A builder with no
// href is shown as coming soon. Builders are plain links (not next/link): each builder has its own
// root layout and stylesheet, so moving between them is a full page load either way.

export type Builder = { name: string; covers: string; href?: string };
export type Lob = { id: string; name: string; blurb: string; builders: Builder[]; note?: string };

const VANES_NOZZLES: Builder = {
  name: "Vanes & Nozzles",
  covers: "Nozzles, vanes, compressor diaphragms, blade rings, ISOs, air seals, support rings",
  href: "/parts/vanes-nozzles",
};

const BUCKETS_BLADES: Builder = {
  name: "Buckets & Blades",
  covers: "Turbine buckets and compressor blades",
  href: "/parts/buckets-blades",
};

export const LOBS: Lob[] = [
  {
    id: "parts",
    name: "Parts",
    blurb: "I&A and Final reports for repaired parts",
    builders: [VANES_NOZZLES, BUCKETS_BLADES],
  },
  {
    id: "field-service",
    name: "Field Service",
    blurb: "Coming soon",
    builders: [],
  },
  {
    id: "repair",
    name: "Repair",
    blurb: "Repair reports, built with the Parts builders for now",
    builders: [VANES_NOZZLES, BUCKETS_BLADES],
    note: "Repair reports use the same builders as Parts until Repair has its own.",
  },
  {
    id: "inspection",
    name: "Inspection",
    blurb: "ATS borescope reports",
    builders: [
      { name: "ATS Borescope Report Builder", covers: "Moving into this app next" },
      { name: "ATS Report Reviewer", covers: "Moving into this app next" },
    ],
  },
  {
    id: "generator",
    name: "Generator",
    blurb: "Coming soon",
    builders: [],
  },
];

export const lobById = (id: string) => LOBS.find((l) => l.id === id);
