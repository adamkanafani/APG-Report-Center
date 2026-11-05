import { renderPdf } from "@/lib/pdf/htmlToPdf";

// Rendered on the app's shared browser (src/lib/pdf/htmlToPdf.ts): one Chrome per server, started
// with first-run chores switched off. Launching a fresh Chrome per page, as this builder did on its
// own, takes minutes on APG machines since the 10/27/2026 Chrome update and fails with "The browser
// is already running for ...".
export function htmlToPdf(html: string): Promise<Buffer> {
  return renderPdf(html, {
    format: "letter",
    printBackground: true,
    margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
  });
}
