/*
geocode: address to coordinates, or coordinates to address.
*/

import { command, OptionKind } from "argsbarg";
import { z } from "zod";
import { google } from "../../google/client.ts";
import { geocode } from "../../google/geocode.ts";
import { jsonFlag } from "../../schemas.ts";

/** Input for `geocode`. */
export const GeocodeInput = z.strictObject({
  query: z
    .string()
    .min(1)
    .describe('An address to find coordinates for, or "lat,lng" to find the address at those coordinates.'),
  limit: z.number().int().min(1).max(5).default(3).describe("Maximum matches (1-5, default 3)."),
  json: jsonFlag,
});

/** Parsed `geocode` input. */
export type GeocodeInput = z.infer<typeof GeocodeInput>;

/** Output of `geocode`. */
export const GeocodeOut = z.strictObject({
  results: z
    .array(
      z.strictObject({
        address: z.string().describe("Formatted address."),
        lat: z.number().describe("Latitude."),
        lng: z.number().describe("Longitude."),
        placeId: z.string().optional().describe("Place ID of the match."),
        types: z.array(z.string()).optional().describe("Result types, e.g. street_address, locality."),
        precision: z
          .string()
          .optional()
          .describe("ROOFTOP (exact), RANGE_INTERPOLATED, GEOMETRIC_CENTER or APPROXIMATE."),
      }),
    )
    .describe("Matches, best first (empty when nothing was found)."),
});

/** Output of `geocode`. */
export type GeocodeOut = z.infer<typeof GeocodeOut>;

/** Geocodes an address or reverse-geocodes coordinates. */
export const geocodeCommand = command({
  key: "geocode",
  description:
    'Convert an address to coordinates, or "lat,lng" to the address at that point, with the Google Geocoding API. For businesses and landmarks use resolve instead.',
  notes: 'Example: {argsbarg:program} geocode "Main Street, Maynooth"; {argsbarg:program} geocode "53.38,-6.59"',
  options: [
    { name: "limit", description: "Maximum matches (1-5, default 3).", kind: OptionKind.Number },
    { name: "json", description: "Emit JSON.", kind: OptionKind.Presence },
  ],
  positionals: [{ name: "query", description: "Address or lat,lng.", kind: OptionKind.String, argMin: 1, argMax: 1 }],
  inputSchema: GeocodeInput,
  outputSchema: GeocodeOut,
  mcpTool: { annotations: { readOnlyHint: true, openWorldHint: true } },
  handler: async (ctx) => {
    const results = await geocode(google(ctx), { query: ctx.inputs.query, limit: ctx.inputs.limit });
    const out: GeocodeOut = { results };
    if (ctx.invocation === "cli") {
      console.log(
        ctx.hasFlag("json")
          ? JSON.stringify(out, null, 2)
          : results.length
            ? results.map((r, i) => `${i + 1}. ${r.address} (${r.lat}, ${r.lng})`).join("\n")
            : "No matches.",
      );
      return;
    }
    return out;
  },
});
