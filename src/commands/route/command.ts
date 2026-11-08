/*
route: travel time and distance between two points.
*/

import { command, OptionKind, ValueFormat } from "argsbarg";
import { z } from "zod";
import { google } from "../../google/client.ts";
import { computeRoute, MODES } from "../../google/routes.ts";
import { jsonFlag } from "../../schemas.ts";

/** One step of a route. */
const StepOut = z.strictObject({
  instruction: z.string().optional().describe("What to do."),
  distance: z.string().describe("Step distance."),
  duration: z.string().describe("Step duration."),
  mode: z.string().optional().describe("walk, transit, ..."),
  transit: z
    .strictObject({
      line: z.string().optional().describe("Line name or number."),
      vehicle: z.string().optional().describe("bus, rail, tram, ..."),
      headsign: z.string().optional().describe("Destination shown on the vehicle."),
      from: z.string().optional().describe("Boarding stop."),
      to: z.string().optional().describe("Alighting stop."),
      stops: z.number().optional().describe("Number of stops."),
      departs: z.string().optional().describe("Departure time (UTC)."),
      arrives: z.string().optional().describe("Arrival time (UTC)."),
    })
    .optional()
    .describe("Transit details for public-transport steps."),
});

/** Input for `route`. */
export const RouteInput = z.strictObject({
  origin: z.string().min(1).describe('Start: an address or place name, a place ID, "lat,lng" or "home".'),
  destination: z.string().min(1).describe('End: an address or place name, a place ID, "lat,lng" or "home".'),
  mode: z.enum(MODES).default("drive").describe("drive (default), walk, bicycle, transit or two_wheeler."),
  departAt: z
    .string()
    .optional()
    .describe(
      'Leave at: "HH:MM" (next occurrence, local time), "YYYY-MM-DDTHH:MM" (local) or RFC 3339. Drive and two_wheeler then use predicted traffic. Not for walk or bicycle.',
    ),
  arriveBy: z.string().optional().describe("Arrive by (transit only), same formats as departAt."),
  traffic: z
    .boolean()
    .default(false)
    .describe("Use live traffic for a drive leaving now (costlier tier). Implied by departAt."),
  avoid: z
    .array(z.enum(["tolls", "highways", "ferries"]))
    .default([])
    .describe("Things to avoid when driving: tolls, highways, ferries."),
  alternatives: z.boolean().default(false).describe("Also return alternative routes."),
  steps: z.boolean().default(false).describe("Include turn-by-turn or transit steps."),
  json: jsonFlag,
});

/** Parsed `route` input. */
export type RouteInput = z.infer<typeof RouteInput>;

/** Output of `route`. */
export const RouteOut = z.strictObject({
  origin: z.string().describe("Start as given."),
  destination: z.string().describe("End as given."),
  mode: z.string().describe("Travel mode used."),
  routes: z
    .array(
      z.strictObject({
        summary: z.string().optional().describe("Main road or line, e.g. via M4."),
        duration: z.string().describe("Travel time, e.g. 38 min."),
        durationSeconds: z.number().describe("Travel time in seconds."),
        trafficFreeDurationSeconds: z.number().optional().describe("Time without traffic, when it differs."),
        distance: z.string().describe("Distance, e.g. 41 km."),
        distanceMeters: z.number().describe("Distance in meters."),
        warnings: z.array(z.string()).optional().describe("Warnings from Google, e.g. about walking paths."),
        steps: z.array(StepOut).optional().describe("Steps, when requested."),
      }),
    )
    .describe("Best route first; empty when no route exists."),
});

/** Output of `route`. */
export type RouteOut = z.infer<typeof RouteOut>;

/** Computes a route. */
export const routeCommand = command({
  key: "route",
  description:
    'Travel time and distance from one point to another by car, on foot, by bike, transit or two-wheeler. Points can be addresses, place names, place IDs, "lat,lng" or "home". Driving uses a static estimate unless you pass departAt or traffic (predicted or live traffic).',
  notes:
    'Example: {argsbarg:program} route home "Dublin Airport" --departAt 07:30 --avoid tolls. Local times use PLACES_TIMEZONE (default Europe/Dublin).',
  options: [
    {
      name: "mode",
      description: "drive (default), walk, bicycle, transit or two_wheeler.",
      kind: OptionKind.Enum,
      choices: [...MODES],
    },
    { name: "departAt", description: "Leave at HH:MM, YYYY-MM-DDTHH:MM (local) or RFC 3339.", kind: OptionKind.String },
    { name: "arriveBy", description: "Arrive by (transit only), same formats.", kind: OptionKind.String },
    { name: "traffic", description: "Use live traffic for a drive leaving now.", kind: OptionKind.Presence },
    {
      name: "avoid",
      description: "Comma-separated: tolls, highways, ferries.",
      kind: OptionKind.String,
      format: ValueFormat.CommaList,
    },
    { name: "alternatives", description: "Also return alternative routes.", kind: OptionKind.Presence },
    { name: "steps", description: "Include steps.", kind: OptionKind.Presence },
    { name: "json", description: "Emit JSON.", kind: OptionKind.Presence },
  ],
  positionals: [
    { name: "origin", description: "Start point.", kind: OptionKind.String, argMin: 1, argMax: 1 },
    { name: "destination", description: "End point.", kind: OptionKind.String, argMin: 1, argMax: 1 },
  ],
  inputSchema: RouteInput,
  outputSchema: RouteOut,
  mcpTool: { annotations: { readOnlyHint: true, openWorldHint: true } },
  handler: async (ctx) => {
    const { origin, destination, mode } = ctx.inputs;
    const routes = await computeRoute(google(ctx), ctx.inputs);
    const out: RouteOut = { origin, destination, mode, routes };
    if (ctx.invocation === "cli") {
      console.log(
        ctx.hasFlag("json")
          ? JSON.stringify(out, null, 2)
          : routes.length
            ? [
                `${origin} → ${destination} by ${mode}`,
                ...routes.map((r, i) => `${i + 1}. ${r.duration}, ${r.distance}${r.summary ? ` (${r.summary})` : ""}`),
              ].join("\n")
            : "No route found.",
      );
      return;
    }
    return out;
  },
});
