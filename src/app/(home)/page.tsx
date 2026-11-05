import { HomeShell } from "./HomeShell";
import { LOBS } from "./lobs";

export default function Home() {
  return (
    <HomeShell subtitle="Pick your line of business.">
      <div className="lob-grid">
        {LOBS.map((lob) =>
          lob.builders.length > 0 ? (
            <a key={lob.id} className="report-type-option lob-tile" href={`/${lob.id}`}>
              <span className="report-type-option-label">{lob.name}</span>
              <span className="report-type-option-description">{lob.blurb}</span>
            </a>
          ) : (
            <div key={lob.id} className="report-type-option lob-tile soon" aria-disabled="true">
              <span className="report-type-option-label">{lob.name}</span>
              <span className="report-type-option-description">{lob.blurb}</span>
            </div>
          ),
        )}
      </div>
    </HomeShell>
  );
}
