"use client";

import { useSyncExternalStore } from "react";
import { REPAIR_PARTS } from "./repairParts";

// The builders never change their URL, so there's nothing to subscribe to.
const noSubscribe = () => () => {};
const partSlug = () => new URLSearchParams(window.location.search).get("part");

/** The part the tech rep picked on the Repair screen ("?part=compressor-diaphragms" →
 * "Compressor Diaphragms"), for the builder's header; `fallback` (the builder's own name) when
 * opened any other way. The server render uses the fallback; the browser swaps in the part. */
export function usePartName(fallback: string): string {
  const slug = useSyncExternalStore(noSubscribe, partSlug, () => null);
  return REPAIR_PARTS.find((p) => p.slug === slug)?.name ?? fallback;
}
