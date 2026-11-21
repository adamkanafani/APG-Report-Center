// Cover field order and labels -- kept free of any server-side import (no fs, no Excel) so the
// builder page, which runs in the browser, can import it without breaking the build.
import type { JobMetadata } from "./jobMetadata";

// Field order and labels match APG's real V&N "Incoming Report" / "Repair Report" cover (page 1:
// Customer through Tech Rep) and component-details page (page 2: Turbine Model onward) -- confirmed
// against Jobs 20312, 19512, 20505 and 20564. renderReportHtml breaks to page 2 after Tech Rep.
export const COVER_FIELD_ORDER: Array<{ key: keyof JobMetadata; label: string; uiLabel?: string }> = [
  { key: "customer", label: "Customer" },
  { key: "customerPO", label: "Customer PO" },
  { key: "assetNumber", label: "Asset#" },
  { key: "unit", label: "Unit #" },
  { key: "part", label: "Part Type" },
  { key: "jobNumber", label: "APG Job #" },
  { key: "date", label: "Date" },
  { key: "techRep", label: "Tech Rep" },
  { key: "detailsCustomer", label: "Customer", uiLabel: "Customer (page 2)" },
  { key: "turbineModel", label: "Turbine Model" },
  { key: "component", label: "Component" },
  { key: "serialNumbers", label: "Serial #’s" },
  { key: "partNumbers", label: "Part Numbers" },
  { key: "quantity", label: "Quantity" },
  { key: "material", label: "Material" },
  { key: "coating", label: "Coating" },
  { key: "priorRepair", label: "Prior Repairs" },
  { key: "hours", label: "Prior Hours" },
  { key: "starts", label: "Prior Starts" },
  { key: "boxes", label: "Boxes" },
];
