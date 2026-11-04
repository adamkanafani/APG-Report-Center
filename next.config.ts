import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs loads its worker file from beside itself; bundled, that file isn't there and every read
  // fails (the cover measurer in src/lib/pdf/coverLayout.ts).
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
