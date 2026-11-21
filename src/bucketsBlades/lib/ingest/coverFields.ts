// Cover field order and labels -- kept free of any server-side import (no fs, no Excel) so the
// builder page, which runs in the browser, can import it without breaking the build.
import type { JobMetadata } from "./jobMetadata";

// Field order and labels match the real "Incoming Report" cover pages (Cover + Incoming Report
// data page) from a completed job, so the review UI and the generated PDF read the same as the
// deliverable it's modeled on.
export const COVER_FIELD_ORDER: Array<{ key: keyof JobMetadata; label: string }> = [
  { key: "customer", label: "Customer" },
  { key: "customerPO", label: "Customer PO" },
  { key: "part", label: "Part Type" },
  { key: "jobNumber", label: "APG Job #" },
  { key: "date", label: "Date" },
  { key: "techRep", label: "Tech Rep" },
  { key: "turbineOEM", label: "Turbine OEM" },
  { key: "turbineModel", label: "Turbine Model" },
  { key: "component", label: "Component" },
  { key: "castPartNumber", label: "Cast Part Number" },
  { key: "machPartNumber", label: "Mach Part Number" },
  { key: "quantity", label: "Quantity" },
  { key: "material", label: "Material" },
  { key: "coating", label: "Coating" },
  { key: "priorRepair", label: "Prior Repair" },
  { key: "hours", label: "Hours" },
  { key: "starts", label: "Starts" },
  { key: "boxes", label: "Boxes" },
];
