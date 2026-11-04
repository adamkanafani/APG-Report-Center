import { promises as fs } from "fs";
import { toLongPath } from "../util/longPath";

/** Where an author's cover puts things, in pt on the 540 x 720pt page (see
 * docs/report-format-reference.md). Each author's differs -- Adan Aguirre (20992): logo 10pt down,
 * a 24pt title at 183.7, rows from 249 with one blank line between them, the details page at 20.5pt
 * from 57.5. Alfredo Resendiz (19797): logo at the top edge, a 28pt title at 203.5, rows from 318,
 * the details page at 18pt with two blank lines between rows. The app measures it off the author's
 * own exported report (measureCoverLayout) and lays both covers out to match. */
export interface CoverLayout {
  logoTop: number;
  titleTop: number;
  titleSize: number;
  /** Page 1 rows: top of the first row's text, text size, blank space between rows in lines. */
  rows1Top: number;
  size1: number;
  gapLines1: number;
  /** The details page, under the page header. */
  rows2Top: number;
  size2: number;
  gapLines2: number;
}

/** Adan's 20992 cover -- used until an author's own report has been measured. */
export const DEFAULT_COVER_LAYOUT: CoverLayout = {
  logoTop: 10,
  titleTop: 183.7,
  titleSize: 24,
  rows1Top: 249,
  size1: 24,
  gapLines1: 1,
  rows2Top: 57.5,
  size2: 24,
  gapLines2: 1,
};

// How far above the baseline a text line's top is taken to be (Arial's full height incl. accents),
// matching the measurements in docs/report-format-reference.md.
const ASCENT = 1.055;

type Item = { str: string; x: number; top: number; size: number };

async function pageItems(page: { getTextContent(): Promise<{ items: unknown[] }>; view: number[] }): Promise<Item[]> {
  const height = page.view[3] - page.view[1];
  const content = await page.getTextContent();
  return (content.items as Array<{ str?: string; transform?: number[] }>)
    .filter((i) => i.str && i.str.trim() && i.transform)
    .map((i) => {
      const t = i.transform!;
      const size = Math.round(Math.hypot(t[2], t[3]) * 10) / 10;
      return { str: i.str!.trim(), x: t[4], top: height - t[5] - ASCENT * size, size };
    });
}

/** The cover rows on a page: the labels down the left edge, top to bottom. */
function rowLayout(items: Item[], below: number) {
  const labels = items.filter((i) => i.x < 60 && i.top > below && /[:#]$|^[A-Za-z][A-Za-z #'’/.]{1,24}$/.test(i.str)).sort((a, b) => a.top - b.top);
  if (labels.length < 3) return null;
  const size = labels[0].size;
  const line = size * 1.2;
  // The closest two labels are two single-line rows: their distance is one line plus the gap.
  const pitch = Math.min(...labels.slice(1).map((l, k) => l.top - labels[k].top).filter((d) => d > line * 0.9));
  if (!Number.isFinite(pitch)) return null;
  return { top: labels[0].top, size, gapLines: Math.max(0, Math.round(((pitch - line) / line) * 4) / 4) };
}

/** The topmost picture on a page (the logo), from the page's drawing operations. */
async function topImage(pdfjs: { OPS: Record<string, number> }, page: { getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>; view: number[] }) {
  const height = page.view[3] - page.view[1];
  const ops = await page.getOperatorList();
  const { OPS } = pdfjs;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let top: number | null = null;
  const multiply = (m: number[], n: number[]) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  ops.fnArray.forEach((fn, k) => {
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, ops.argsArray[k] as number[]);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject) {
      const imageTop = height - (ctm[5] + Math.max(ctm[3], 0));
      if (Math.abs(ctm[3]) > 60 && (top === null || imageTop < top)) top = Math.max(0, imageTop);
    }
  });
  return top;
}

/** Measures an author's cover off their exported report PDF. Null when it doesn't look like one of
 * their 540 x 720pt cover pages. */
export async function measureCoverLayout(pdfPath: string): Promise<CoverLayout | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(await fs.readFile(toLongPath(pdfPath)));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
    let layout: CoverLayout | null = null;
    for (let n = 1; n <= Math.min(doc.numPages, 5); n++) {
      const page = await doc.getPage(n);
      const items = await pageItems(page as never);
      const hasRows = items.some((i) => /^customer\s*:?$|^turbine model/i.test(i.str));
      if (!hasRows) continue;
      if (!layout) {
        const title = items.filter((i) => /report$/i.test(i.str) && i.top < 320).sort((a, b) => b.size - a.size)[0];
        if (!title) continue;
        const rows = rowLayout(items, title.top + title.size);
        if (!rows) continue;
        const logoTop = await topImage(pdfjs as never, page as never);
        layout = {
          ...DEFAULT_COVER_LAYOUT,
          logoTop: logoTop ?? DEFAULT_COVER_LAYOUT.logoTop,
          titleTop: title.top,
          titleSize: title.size,
          rows1Top: rows.top,
          size1: rows.size,
          gapLines1: rows.gapLines,
        };
        continue;
      }
      // The details page: rows under the page header (44pt logo band and its bars).
      const rows = rowLayout(items, 50);
      if (rows) layout = { ...layout, rows2Top: rows.top, size2: rows.size, gapLines2: rows.gapLines };
      break;
    }
    await doc.destroy();
    return layout;
  } catch {
    return null;
  }
}
