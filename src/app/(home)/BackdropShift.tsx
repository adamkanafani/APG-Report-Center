export type Entrance = "flood";

/** How an ATS line's screen (Inspection) takes over the Report Center's blue backdrop as it opens:
 *  the ATS red fades in over the blue, slowly and evenly, so the page settles into red without
 *  anything sweeping or flashing across it. APG lines (Parts) keep the blue, with no animation. */
export function BackdropShift({ entrance: _entrance }: { entrance: Entrance }) {
  return <div className="backdrop-shift" aria-hidden="true" />;
}
