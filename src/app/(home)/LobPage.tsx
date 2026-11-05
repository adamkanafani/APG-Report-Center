import { notFound } from "next/navigation";
import { HomeShell } from "./HomeShell";
import { lobById } from "./lobs";

/** A line of business's own screen: one button per report builder under it. */
export function LobPage({ id }: { id: string }) {
  const lob = lobById(id);
  if (!lob) notFound();
  return (
    <HomeShell subtitle={`${lob.name}: which report are you building?`} back={{ href: "/", label: "All lines of business" }}>
      <div className="lob-grid">
        {lob.builders.map((b) =>
          b.href ? (
            <a key={b.name} className="report-type-option lob-tile" href={b.href}>
              <span className="report-type-option-label">{b.name}</span>
              <span className="report-type-option-description">{b.covers}</span>
            </a>
          ) : (
            <div key={b.name} className="report-type-option lob-tile soon" aria-disabled="true">
              <span className="report-type-option-label">{b.name}</span>
              <span className="report-type-option-description">{b.covers}</span>
            </div>
          ),
        )}
      </div>
      {lob.note && <p className="lob-note">{lob.note}</p>}
    </HomeShell>
  );
}
