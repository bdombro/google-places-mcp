/*
Geocoding API: address to coordinates, and coordinates to address.
*/

import { cleanText, parseLatLng } from "../util.ts";
import { type Google, request } from "./client.ts";

/** One geocoding match. */
export type GeocodeResult = {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
  types?: string[];
  precision?: string;
};

/** Geocodes an address, or reverse-geocodes when `query` is "lat,lng". */
export async function geocode(g: Google, o: { query: string; limit: number }): Promise<GeocodeResult[]> {
  const point = parseLatLng(o.query);
  const json = (await request(g, {
    api: "geocode",
    method: "GET",
    query: {
      ...(point ? { latlng: `${point.lat},${point.lng}` } : { address: o.query }),
      region: g.config.region,
      language: g.config.language,
    },
  })) as {
    results?: {
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
      place_id?: string;
      types?: string[];
    }[];
  };
  const out: GeocodeResult[] = [];
  for (const r of json?.results ?? []) {
    const lat = r.geometry?.location?.lat;
    const lng = r.geometry?.location?.lng;
    if (lat === undefined || lng === undefined) continue;
    out.push({
      address: cleanText(r.formatted_address, 300) ?? "",
      lat,
      lng,
      ...(r.place_id ? { placeId: r.place_id } : {}),
      ...(r.types?.length ? { types: r.types.filter((t) => /^[a-z0-9_]+$/.test(t)) } : {}),
      ...(r.geometry?.location_type ? { precision: r.geometry.location_type } : {}),
    });
    if (out.length >= o.limit) break;
  }
  return out;
}
