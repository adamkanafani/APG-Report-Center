import type { NextConfig } from "next";
import { execSync } from "child_process";

/** "1cf4d81 · Oct 12" -- shown in the ATS Report Reviewer so it's obvious whether Update.bat took. */
function appVersion(): string {
  try {
    return execSync('git log -1 --format="%h · %cd" --date=format:"%b %d"', { encoding: "utf8" }).trim();
  } catch {
    return "unknown version";
  }
}

const nextConfig: NextConfig = {
  // pdfjs loads its worker file from beside itself; bundled, that file isn't there and every read
  // fails (the cover measurer in src/lib/pdf/coverLayout.ts).
  serverExternalPackages: ["pdfjs-dist"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion(),
  },
};

export default nextConfig;
