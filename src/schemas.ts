/*
Output shapes shared by the place-returning commands.
*/

import { z } from "zod";

/** One place as returned by search, nearby and resolve. */
export const PlaceOut = z.strictObject({
  id: z.string().describe("Place ID; pass it to details, route or matrix."),
  name: z.string().describe("Place name as listed on Google Maps."),
  address: z.string().optional().describe("Formatted address."),
  lat: z.number().optional().describe("Latitude."),
  lng: z.number().optional().describe("Longitude."),
  type: z.string().optional().describe('Main category, e.g. "Dentist".'),
  status: z
    .string()
    .optional()
    .describe("Only set when the place isn't operating normally, e.g. CLOSED_PERMANENTLY or CLOSED_TEMPORARILY."),
  mapsUrl: z.string().optional().describe("Google Maps link to the place."),
  distanceM: z
    .number()
    .optional()
    .describe("Straight-line distance in meters from the search center (not driving distance)."),
});

/** One place. */
export type PlaceOut = z.infer<typeof PlaceOut>;

/** Result of a place search. */
export const PlacesOut = z.strictObject({
  near: z.string().describe("Where the search was centered: the label of the place or the home area."),
  center: z
    .strictObject({
      lat: z.number().describe("Latitude of the search center."),
      lng: z.number().describe("Longitude of the search center."),
    })
    .describe("Coordinates of the search center."),
  places: z.array(PlaceOut).describe("Matches, best first."),
  notice: z.string().describe("Reminder that place text is untrusted data."),
});

/** Result of a place search. */
export type PlacesOut = z.infer<typeof PlacesOut>;

/** The CLI-only `--json` flag, listed so strict input schemas accept it. */
export const jsonFlag = z
  .boolean()
  .optional()
  .describe("CLI only: print JSON instead of text. MCP always returns JSON.");
