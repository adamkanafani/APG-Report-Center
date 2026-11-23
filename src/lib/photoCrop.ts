// A tech rep's crop / zoom of one report photo -- shared by the repair builders' photo pickers
// (browser) and their PDF renderers (server), so this file imports nothing.
//
// The crop is a rectangle in fractions of the photo as it's shown upright (EXIF rotation applied,
// the same way every thumbnail and the report embed it): x, y = top-left corner, w, h = size, all
// 0-1. Its shape is locked to the shape the photo prints at -- a Vanes & Nozzles slot is 246 x 206
// pt; a Buckets & Blades photo keeps the photo's own shape -- so a cropped photo fills its spot
// exactly like an uncropped one and every photo on the page keeps the same outline.

export interface PhotoCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Vanes & Nozzles photo slots: 246 x 206 pt (renderReportHtml's .photo-page-grid). */
export const VN_SLOT_ASPECT = 246 / 206;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The biggest crop of `aspect` (width / height of the printed spot) that fits a photo of
 *  `imageAspect`, centered -- what printing with no crop shows (CSS object-fit: cover). */
export function fullCrop(aspect: number, imageAspect: number): PhotoCrop {
  if (imageAspect > aspect) {
    const w = aspect / imageAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = imageAspect / aspect;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** A crop kept inside the photo, at least 5% of it, with the shape of `aspect`. */
export function fitCrop(crop: PhotoCrop, aspect: number, imageAspect: number): PhotoCrop {
  const full = fullCrop(aspect, imageAspect);
  const w = clamp(crop.w, full.w * 0.05, full.w);
  const h = (w * imageAspect) / aspect;
  return { x: clamp(crop.x, 0, 1 - w), y: clamp(crop.y, 0, 1 - h), w, h };
}

/** A saved crop, or null when it's missing or not a real rectangle. */
export function validCrop(c: unknown): PhotoCrop | null {
  if (!c || typeof c !== "object") return null;
  const { x, y, w, h } = c as Record<string, unknown>;
  if (![x, y, w, h].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const crop = { x: x as number, y: y as number, w: w as number, h: h as number };
  if (crop.w <= 0 || crop.h <= 0 || crop.x < -0.001 || crop.y < -0.001 || crop.x + crop.w > 1.001 || crop.y + crop.h > 1.001) return null;
  return crop;
}

/** CSS that shows just the cropped part of an <img> (Chrome / Edge object-view-box), for
 *  thumbnails -- with object-fit: cover the crop fills the thumbnail like it fills the report. */
export function cropViewBox(crop: PhotoCrop): string {
  const pct = (v: number) => `${(Math.max(0, v) * 100).toFixed(3)}%`;
  return `inset(${pct(crop.y)} ${pct(1 - crop.x - crop.w)} ${pct(1 - crop.y - crop.h)} ${pct(crop.x)})`;
}

/** The crop in pixels of an upright image `width` x `height`, for sharp's extract(). */
export function cropPixels(crop: PhotoCrop, width: number, height: number) {
  const left = clamp(Math.round(crop.x * width), 0, width - 1);
  const top = clamp(Math.round(crop.y * height), 0, height - 1);
  return {
    left,
    top,
    width: clamp(Math.round(crop.w * width), 1, width - left),
    height: clamp(Math.round(crop.h * height), 1, height - top),
  };
}
