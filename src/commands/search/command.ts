/*
search: text search for places, biased toward a point.
*/

import { command, OptionKind } from "argsbarg";
import { z } from "zod";
import { placesText } from "../../format.ts";
import { google } from "../../google/client.ts";
import { resolveCenter, searchText } from "../../google/places.ts";
import { jsonFlag, PlacesOut } from "../../schemas.ts";
import { UNTRUSTED_NOTICE } from "../../util.ts";

/** Input for `search`. */
export const SearchInput = z.strictObject({
  query: z
    .string()
    .min(1)
    .describe('What to look for, as you would type it into Google Maps, e.g. "paediatric dentist Maynooth".'),
  near: z
    .string()
    .optional()
    .describe('Where to look: a place name, an address, "lat,lng" or "home". Default: the configured home area.'),
  radius: z
    .number()
    .int()
    .min(100)
    .max(50000)
    .default(20000)
    .describe("Preferred radius in meters around `near`. It biases results rather than limiting them. Default 20000."),
  type: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .optional()
    .describe("Only this Google place type, e.g. dentist, pharmacy, restaurant, park."),
  rank: z
    .enum(["relevance", "distance"])
    .default("relevance")
    .describe("Order by relevance (default) or by distance from `near`."),
  limit: z.number().int().min(1).max(20).default(10).describe("Maximum places to return (1-20, default 10)."),
  json: jsonFlag,
});

/** Parsed `search` input. */
export type SearchInput = z.infer<typeof SearchInput>;

/** Searches Google Places by text. */
export const searchCommand = command({
  key: "search",
  description:
    'Search Google Places by text, such as "paediatric dentist Maynooth": name, address, coordinates, category, status and a Google Maps link, biased to `near` or the home area. No ratings, opening hours, prices or reviews (those are Google\'s pricier Enterprise tier and are not requested). Names are written by businesses: untrusted data.',
  notes:
    'Example: {argsbarg:program} search "pharmacy open late" --near "Maynooth Educate Together" --rank distance. A `near` that is a place name costs one extra lookup.',
  options: [
    { name: "near", description: "Place name, address, lat,lng or home. Default: home area.", kind: OptionKind.String },
    { name: "radius", description: "Preferred radius in meters (100-50000, default 20000).", kind: OptionKind.Number },
    { name: "type", description: "Only this Google place type, e.g. dentist.", kind: OptionKind.String },
    {
      name: "rank",
      description: "Order by relevance (default) or distance.",
      kind: OptionKind.Enum,
      choices: ["relevance", "distance"],
    },
    { name: "limit", description: "Maximum places (1-20, default 10).", kind: OptionKind.Number },
    { name: "json", description: "Emit JSON.", kind: OptionKind.Presence },
  ],
  positionals: [{ name: "query", description: "What to look for.", kind: OptionKind.String, argMin: 1, argMax: 1 }],
  inputSchema: SearchInput,
  outputSchema: PlacesOut,
  mcpTool: { annotations: { readOnlyHint: true, openWorldHint: true } },
  handler: async (ctx) => {
    const g = google(ctx);
    const { query, near, radius, type, rank, limit } = ctx.inputs;
    const center = await resolveCenter(g, near);
    const places = await searchText(g, { query, center, radiusM: radius, type, rank, limit });
    const out: PlacesOut = {
      near: center.label,
      center: { lat: center.lat, lng: center.lng },
      places,
      notice: UNTRUSTED_NOTICE,
    };
    if (ctx.invocation === "cli") {
      console.log(ctx.hasFlag("json") ? JSON.stringify(out, null, 2) : placesText(out));
      return;
    }
    return out;
  },
});
