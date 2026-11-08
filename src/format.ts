/*
Plain-text rendering for CLI output (agents get the structured JSON instead).
*/

import type { PlacesOut } from "./schemas.ts";
import { formatDistance } from "./util.ts";

/** Renders a place list as numbered lines with the place ID underneath. */
export function placesText(out: PlacesOut): string {
  if (!out.places.length) return `No places found near ${out.near}.`;
  const lines = out.places.map((p, i) => {
    const bits = [p.type, p.distanceM === undefined ? undefined : formatDistance(p.distanceM), p.status]
      .filter(Boolean)
      .join(", ");
    return `${i + 1}. ${p.name}${p.address ? ` — ${p.address}` : ""}${bits ? ` (${bits})` : ""}\n   ${p.id}`;
  });
  return [`Near ${out.near}:`, ...lines].join("\n");
}
