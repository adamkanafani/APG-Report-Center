import type { ReactNode } from "react";

/** The logo lockup and backdrop every home screen shares (same look as the builders' first screen). */
export function HomeShell({ subtitle, back, children }: { subtitle: string; back?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="folder-picker home">
      {back && (
        <a className="home-link" href={back.href}>
          ← {back.label}
        </a>
      )}
      <div className="app-logo">
        <img src="/apg-mark-transparent.png" alt="" className="app-logo-icon" />
        <div className="app-wordmark">
          <span className="app-wordmark-eyebrow">Allied Power Group</span>
          <h1>Report Center</h1>
        </div>
      </div>
      <div className="app-logo-bar" />
      <p className="folder-picker-subtitle">{subtitle}</p>
      {children}
    </div>
  );
}
