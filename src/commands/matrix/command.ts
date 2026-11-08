/*
matrix: travel time and distance for every origin/destination pair.
*/

import { command, OptionKind } from "argsbarg";
import { z } from "zod";
import { google } from "../../google/client.ts";
import { computeMatrix, MODES } from "../../google/routes.ts";
import { jsonFlag } from "../../schemas.ts";

/** A list of points: a JSON array, or one string with points separated by "|" (CLI). */
const Points = z.union([
  z.array(z.string().min(1)).min(1).max(25),
  z
    .string()
    .min(1)
    .transform((s) =>
      s
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean),
    ),
]);

/** Input for `matrix`. */
export const MatrixInput = z.strictObject({
  origins: Points.describe(
    'Start points (up to 25): addresses, place names, place IDs, "lat,lng" or "home". On the CLI separate them with "|".',
  ),
  destinations: Points.describe("End points (up to 25), same formats as origins."),
  mode: z.enum(MODES).default("drive").describe("drive (default), walk, bicycle, transit or two_wheeler."),
  departAt: z
    .string()
    .optional()
    .describe(
      'Leave at: "HH:MM" (next occurrence, local), "YYYY-MM-DDTHH:MM" (local) or RFC 3339. Not for walk or bicycle.',
    ),
  traffic: z
    .boolean()
    .default(false)
    .describe("Use live traffic for driving now (costlier tier). Implied by departAt."),
  json: jsonFlag,
});

/** Parsed `matrix` input. */
export type MatrixInput = z.infer<typeof MatrixInput>;

/** Output of `matrix`. */
export const MatrixOut = z.strictObject({
  mode: z.string().describe("Travel mode used."),
  elements: z
    .array(
      z.strictObject({
        originIndex: z.number().describe("Index into the origins list."),
        destinationIndex: z.number().describe("Index into the destinations list."),
        origin: z.string().describe("Origin as given."),
        destination: z.string().describe("Destination as given."),
        routeFound: z.boolean().describe("False when no route exists for this pair."),
        duration: z.string().optional().describe("Travel time, e.g. 12 min."),
        durationSeconds: z.number().optional().describe("Travel time in seconds."),
        distance: z.string().optional().describe("Distance, e.g. 4.1 km."),
        distanceMeters: z.number().optional().describe("Distance in meters."),
      }),
    )
    .describe("One entry per pair, ordered by origin then destination."),
});

/** Output of `matrix`. */
export type MatrixOut = z.infer<typeof MatrixOut>;

/** Computes a distance matrix. */
export const matrixCommand = command({
  key: "matrix",
  description:
    'Travel time and distance for every pair of several origins and destinations, e.g. which of four clinics is quickest to reach from school at 08:30. Up to 25 origins and 25 destinations (625 pairs; 100 for transit). Points can be addresses, place names, place IDs, "lat,lng" or "home".',
  notes:
    'Example: {argsbarg:program} matrix --origins "home|Maynooth Library" --destinations "Dublin Airport|Heuston Station" --departAt 08:30',
  options: [
    { name: "origins", description: 'Start points separated by "|".', kind: OptionKind.String, required: true },
    { name: "destinations", description: 'End points separated by "|".', kind: OptionKind.String, required: true },
    {
      name: "mode",
      description: "drive (default), walk, bicycle, transit or two_wheeler.",
      kind: OptionKind.Enum,
      choices: [...MODES],
    },
    { name: "departAt", description: "Leave at HH:MM, YYYY-MM-DDTHH:MM (local) or RFC 3339.", kind: OptionKind.String },
    { name: "traffic", description: "Use live traffic for driving now.", kind: OptionKind.Presence },
    { name: "json", description: "Emit JSON.", kind: OptionKind.Presence },
  ],
  inputSchema: MatrixInput,
  outputSchema: MatrixOut,
  mcpTool: { annotations: { readOnlyHint: true, openWorldHint: true } },
  handler: async (ctx) => {
    const { origins, destinations, mode, departAt, traffic } = ctx.inputs;
    const elements = await computeMatrix(google(ctx), { origins, destinations, mode, departAt, traffic });
    const out: MatrixOut = { mode, elements };
    if (ctx.invocation === "cli") {
      console.log(
        ctx.hasFlag("json")
          ? JSON.stringify(out, null, 2)
          : elements
              .map(
                (e) => `${e.origin} → ${e.destination}: ${e.routeFound ? `${e.duration}, ${e.distance}` : "no route"}`,
              )
              .join("\n"),
      );
      return;
    }
    return out;
  },
});
