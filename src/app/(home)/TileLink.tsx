import type { ReactNode } from "react";

/** A home-screen tile that opens a line of business or a report builder. */
export function TileLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
