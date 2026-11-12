// The parts on the Repair screen, one button each. Each opens the builder made for it, with
// "?part=<slug>" so the builder's header names the part the tech rep picked ("Compressor
// Diaphragms", not "Vanes & Nozzles") -- see usePartName.

export const VANES_NOZZLES_HREF = "/parts/vanes-nozzles";
export const BUCKETS_BLADES_HREF = "/parts/buckets-blades";

export type RepairPart = { slug: string; name: string; covers: string; builder: string };

export const REPAIR_PARTS: RepairPart[] = [
  { slug: "nozzles", name: "Nozzles", covers: "Turbine nozzles, every stage", builder: VANES_NOZZLES_HREF },
  { slug: "vanes", name: "Vanes", covers: "Turbine vanes, every row", builder: VANES_NOZZLES_HREF },
  { slug: "buckets", name: "Buckets", covers: "Turbine buckets", builder: BUCKETS_BLADES_HREF },
  { slug: "blades", name: "Blades", covers: "Compressor blades", builder: BUCKETS_BLADES_HREF },
  { slug: "compressor-diaphragms", name: "Compressor Diaphragms", covers: "Diaphragms, stators and seal holders", builder: VANES_NOZZLES_HREF },
  { slug: "blade-rings", name: "Blade Rings", covers: "Blade rings and ring segments", builder: VANES_NOZZLES_HREF },
  { slug: "isos-air-seals", name: "ISOs & Air Seals", covers: "Isolation segments and seal housings", builder: VANES_NOZZLES_HREF },
  { slug: "support-rings-carriers", name: "Support Rings & Carriers", covers: "Inner support rings and vane carriers", builder: VANES_NOZZLES_HREF },
];

export const repairPartHref = (p: RepairPart) => `${p.builder}?part=${p.slug}`;
