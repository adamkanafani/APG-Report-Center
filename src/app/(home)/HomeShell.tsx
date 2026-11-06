import type { ReactNode } from "react";
import { BackdropShift, type Entrance } from "./BackdropShift";
import type { Theme } from "./lobs";

/** The logo lockup and backdrop every Report Center screen shares. The tiles carry each line's own
 * look (APG blue, ATS black-and-red). A line's own screen takes over the Report Center's blue
 * backdrop as it opens (BackdropShift): ATS red floods in for Inspection, a steel scan for Parts. */
export function HomeShell({ subtitle, back, theme = "apg", entrance, children }: { subtitle: string; back?: { href: string; label: string }; theme?: Theme; entrance?: Entrance; children: ReactNode }) {
  return (
    <div className={`folder-picker home home-${theme}${entrance ? " home-entrance" : ""}`}>
      {entrance && <BackdropShift entrance={entrance} />}
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
