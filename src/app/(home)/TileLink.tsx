"use client";

import type { ReactNode } from "react";

/** Where on the screen the last tile was clicked, as viewport percentages; the next screen's
 * backdrop change (BackdropShift) spreads out from that spot. */
export const ORIGIN_KEY = "report-center-click-origin";

export function TileLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        try {
          sessionStorage.setItem(ORIGIN_KEY, JSON.stringify({ x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 }));
        } catch {
          // Storage blocked: the change starts from the default corner instead.
        }
      }}
    >
      {children}
    </a>
  );
}
