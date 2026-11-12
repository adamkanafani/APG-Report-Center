"use client";

import { useEffect, useState } from "react";
import { ORIGIN_KEY } from "./TileLink";

export type Entrance = "flood" | "scan";

/** How a line's screen takes over the Report Center's blue backdrop as it opens.
 * - "flood" (Inspection, an ATS line): ATS red floods out from where its tile was clicked, led by a
 *   white shock ring.
 * - "scan" (Parts): a brushed-steel blue sweeps down the page from the top, uncovering the APG
 *   spire in the bottom-right corner as it passes.
 * Shown only after mount, so the flood starts from the click spot rather than a default and then
 * jumping. */
export function BackdropShift({ entrance }: { entrance: Entrance }) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let start = { x: 100, y: 100 };
    try {
      const saved = JSON.parse(sessionStorage.getItem(ORIGIN_KEY) ?? "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) start = saved;
      sessionStorage.removeItem(ORIGIN_KEY);
    } catch {
      // Storage blocked: start from the bottom-right corner, where the rings come from.
    }
    setOrigin(start);
  }, []);

  if (!origin) return null;
  if (entrance === "scan") {
    return (
      <>
        <div className="backdrop-scan" aria-hidden="true" />
        <div className="backdrop-spire" aria-hidden="true" />
      </>
    );
  }
  const style = { "--ox": `${origin.x}%`, "--oy": `${origin.y}%` } as React.CSSProperties;
  return (
    <>
      <div className="backdrop-shift" style={style} aria-hidden="true" />
      <div className="backdrop-shift-ring" style={style} aria-hidden="true" />
    </>
  );
}
