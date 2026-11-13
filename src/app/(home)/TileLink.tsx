import type { CSSProperties, ReactNode } from "react";

/** A home-screen tile that opens a line of business or a report builder. */
export function TileLink({ href, className, style, children }: { href: string; className: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <a href={href} className={className} style={style}>
      {children}
    </a>
  );
}
