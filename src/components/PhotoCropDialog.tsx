"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cropViewBox, fitCrop, fullCrop, type PhotoCrop } from "@/lib/photoCrop";

/**
 * Crop / zoom one report photo, the way the tech reps used to in PowerPoint -- but the frame keeps
 * the exact shape the photo prints at (`aspect`: width / height of its spot on the page, or "photo"
 * to keep the photo's own shape), so a cropped photo fills its spot like every other one. Drag the
 * frame to move it; the slider or the mouse wheel zooms in and out. "No crop" goes back to the
 * report's normal automatic fit. Self-contained styles: used by both repair builders.
 */
export function PhotoCropDialog({
  src,
  title,
  aspect,
  crop,
  onSave,
  onClose,
}: {
  src: string;
  title: string;
  aspect: number | "photo";
  crop: PhotoCrop | null;
  onSave: (crop: PhotoCrop | null) => void;
  onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [box, setBox] = useState<PhotoCrop | null>(null);
  const drag = useRef<{ px: number; py: number; start: PhotoCrop } | null>(null);

  const target = aspect === "photo" ? imageAspect ?? 4 / 3 : aspect;
  const full = imageAspect ? fullCrop(target, imageAspect) : null;
  const zoom = full && box ? full.w / box.w : 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onLoad = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const ia = img.naturalWidth / img.naturalHeight;
    setImageAspect(ia);
    const t = aspect === "photo" ? ia : aspect;
    setBox(crop ? fitCrop(crop, t, ia) : fullCrop(t, ia));
  };

  /** Zoom to `z` around the frame's center (1 = the whole printable area). */
  const setZoom = (z: number) => {
    if (!full || !box || !imageAspect) return;
    const w = full.w / Math.min(8, Math.max(1, z));
    const h = (w * imageAspect) / target;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    setBox(fitCrop({ x: cx - w / 2, y: cy - h / 2, w, h }, target, imageAspect));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!box) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, start: box };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const img = imgRef.current;
    if (!d || !img || !imageAspect) return;
    const r = img.getBoundingClientRect();
    const dx = (e.clientX - d.px) / r.width;
    const dy = (e.clientY - d.py) / r.height;
    setBox(fitCrop({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, target, imageAspect));
  };
  const onPointerUp = () => (drag.current = null);

  const s: Record<string, CSSProperties> = {
    overlay: { position: "fixed", inset: 0, background: "rgba(10,20,40,0.72)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
    panel: { background: "#fff", color: "#1a2f55", borderRadius: 12, padding: 16, overflow: "auto", maxWidth: "min(1100px, 96vw)", maxHeight: "96vh", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", fontFamily: "inherit" },
    head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    stage: { position: "relative", alignSelf: "center", lineHeight: 0, userSelect: "none", touchAction: "none" },
    img: { display: "block", maxWidth: "min(860px, 80vw)", maxHeight: "58vh" },
    frame: { position: "absolute", border: "2px solid #fff", outline: "1px solid rgba(0,0,0,0.6)", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", cursor: "move" },
    side: { display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" },
    preview: { width: 160, height: 160 / target, objectFit: "cover", border: "1px solid #999", background: "#eee" },
    buttons: { display: "flex", gap: 8, marginLeft: "auto" },
    btn: { padding: "6px 14px", borderRadius: 6, border: "1px solid #b7c4d8", background: "#fff", color: "#0b3d91", cursor: "pointer", font: "inherit", fontWeight: 600, boxShadow: "none" },
    primary: { padding: "6px 14px", borderRadius: 6, border: "1px solid #0b3d91", background: "#0b3d91", color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 600, boxShadow: "none" },
  };

  return (
    <div style={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.panel} role="dialog" aria-label={`Crop ${title}`}>
        <div style={s.head}>
          <strong>Crop / zoom</strong>
          <span style={{ fontSize: 12, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>{title}</span>
        </div>
        <div
          style={s.stage}
          onWheel={(e) => {
            if (!box) return;
            setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={src} alt={title} style={s.img} onLoad={onLoad} draggable={false} />
          {box && (
            <div
              style={{ ...s.frame, left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          )}
        </div>
        <div style={s.side}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Zoom
            <input type="range" min={1} max={8} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} disabled={!box} style={{ width: 220 }} />
            <span style={{ width: 44, fontVariantNumeric: "tabular-nums" }}>{zoom.toFixed(1)}×</span>
          </label>
          {box && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#555" }}>
              In the report:
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" style={{ ...s.preview, objectViewBox: cropViewBox(box) } as CSSProperties} />
            </div>
          )}
          <div style={s.buttons}>
            <button type="button" style={s.btn} onClick={() => onSave(null)} title="Print the photo with the normal automatic fit">
              No crop
            </button>
            <button type="button" style={s.btn} onClick={onClose}>
              Cancel
            </button>
            <button type="button" style={s.primary} disabled={!box} onClick={() => box && onSave(box)}>
              Save crop
            </button>
          </div>
        </div>
        <span style={{ fontSize: 12, color: "#666" }}>Drag the frame to move it. Scroll or use the slider to zoom. The frame keeps the photo&apos;s printed shape.</span>
      </div>
    </div>
  );
}
