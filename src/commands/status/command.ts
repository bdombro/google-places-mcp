/*
status: settings in effect, and (on request) which Google APIs the key can reach.
*/

import { command, OptionKind } from "argsbarg";
import { z } from "zod";
import { type Google, google, request } from "../../google/client.ts";
import { jsonFlag } from "../../schemas.ts";

/** Input for `status`. */
export const StatusInput = z.strictObject({
  probe: z
    .boolean()
    .default(false)
    .describe(
      "Make one tiny call to each API to see which are enabled (costs a fraction of a cent; the Places call is free).",
    ),
  json: jsonFlag,
});

/** Parsed `status` input. */
export type StatusInput = z.infer<typeof StatusInput>;

/** Result of probing one API. */
const ProbeOut = z.strictObject({
  ok: z.boolean().describe("Whether the call succeeded."),
  message: z.string().optional().describe("Why it failed, including how to enable the API."),
});

/** Output of `status`. */
export const StatusOut = z.strictObject({
  version: z.string().describe("Plugin version."),
  keyConfigured: z.boolean().describe("Whether GOOGLE_PLACES_API_KEY (or GOOGLE_PLACE_API_KEY) is set."),
  home: z
    .strictObject({ lat: z.number().describe("Latitude."), lng: z.number().describe("Longitude.") })
    .describe("Home area used as the default search center."),
  region: z.string().describe("Region bias."),
  language: z.string().describe("Result language."),
  timeZone: z.string().describe("Time zone for local departure times."),
  probes: z
    .strictObject({
      geocoding: ProbeOut.describe("Geocoding API (geocode)."),
      places: ProbeOut.describe("Places API (New) (search, nearby, details, resolve, photo)."),
      routes: ProbeOut.describe("Routes API (route, matrix)."),
    })
    .optional()
    .describe("Only with probe."),
});

/** Output of `status`. */
export type StatusOut = z.infer<typeof StatusOut>;

/** Reports settings and optionally probes the APIs. */
export const statusCommand = command({
  key: "status",
  description:
    "Show the plugin's settings (key present, home area, region, language, time zone) and, with probe, whether the key can reach the Geocoding, Places (New) and Routes APIs. A disabled API reports how to enable it.",
  options: [
    { name: "probe", description: "Call each API once to check it is enabled.", kind: OptionKind.Presence },
    { name: "json", description: "Emit JSON.", kind: OptionKind.Presence },
  ],
  inputSchema: StatusInput,
  outputSchema: StatusOut,
  mcpTool: { annotations: { readOnlyHint: true, openWorldHint: true } },
  handler: async (ctx) => {
    const g = google(ctx);
    const out: StatusOut = {
      version: ctx.spec.version,
      keyConfigured: g.config.apiKey !== "",
      home: g.config.home,
      region: g.config.region,
      language: g.config.language,
      timeZone: g.config.timeZone,
    };
    if (ctx.inputs.probe) out.probes = await probeApis(g);
    if (ctx.invocation === "cli") {
      console.log(
        ctx.hasFlag("json")
          ? JSON.stringify(out, null, 2)
          : [
              `google-places ${out.version}`,
              `key: ${out.keyConfigured ? "set" : "NOT SET"}`,
              `home: ${out.home.lat},${out.home.lng}  region: ${out.region}  language: ${out.language}  tz: ${out.timeZone}`,
              ...(out.probes
                ? Object.entries(out.probes).map(([api, p]) => `${api}: ${p.ok ? "ok" : `FAILED: ${p.message}`}`)
                : []),
            ].join("\n"),
      );
      return;
    }
    return out;
  },
});

/** Calls each API once with the cheapest request and records success or the failure message. */
async function probeApis(g: Google): Promise<NonNullable<StatusOut["probes"]>> {
  const attempt = async (call: () => Promise<unknown>) => {
    try {
      await call();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  };
  const geocoding = await attempt(() =>
    request(g, { api: "geocode", method: "GET", query: { address: "Dublin, Ireland" } }),
  );
  const places = await attempt(() =>
    request(g, {
      api: "places",
      method: "POST",
      path: "/places:searchText",
      fieldMask: "places.id",
      body: { textQuery: "Dublin", maxResultCount: 1 },
    }),
  );
  const home = { latitude: g.config.home.lat, longitude: g.config.home.lng };
  const routes = await attempt(() =>
    request(g, {
      api: "routes",
      method: "POST",
      path: "/directions/v2:computeRoutes",
      fieldMask: "routes.distanceMeters",
      body: {
        origin: { location: { latLng: home } },
        destination: { location: { latLng: { latitude: home.latitude + 0.01, longitude: home.longitude } } },
        travelMode: "DRIVE",
      },
    }),
  );
  return { geocoding, places, routes };
}
