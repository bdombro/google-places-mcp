/*
Places API (New) calls. Everything here stays within Google's Pro tier or below: names, addresses,
coordinates, categories, status, links, time zone, accessibility and photo references. Ratings, hours,
prices, phones, websites, reviews and attributes are Enterprise-tier fields and are deliberately not requested.
*/

import type { PlaceOut } from "../schemas.ts";
import { cleanText, distanceMeters, type LatLng, parseLatLng } from "../util.ts";
import { type Google, GoogleError, request } from "./client.ts";

/** Details of one place beyond the list fields. */
export type DetailsResult = PlaceOut & {
  types?: string[];
  timeZone?: string;
  accessibility?: string[];
  photos?: { name: string; widthPx?: number; heightPx?: number; author?: string }[];
};

/** Raw place as Google returns it (only the fields we request). */
export type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  googleMapsUri?: string;
  timeZone?: { id?: string };
  accessibilityOptions?: Record<string, unknown>;
  photos?: { name?: string; widthPx?: number; heightPx?: number; authorAttributions?: { displayName?: string }[] }[];
};

/** Where a search is centered. */
export type Center = LatLng & { label: string };

/** Fields for list results (Pro tier). */
const LIST_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "primaryTypeDisplayName",
  "businessStatus",
  "googleMapsUri",
];

/** Fields for place details (Pro tier; photo references are free). */
const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "location",
  "types",
  "primaryTypeDisplayName",
  "businessStatus",
  "googleMapsUri",
  "timeZone",
  "accessibilityOptions",
];

/** A place ID path segment. */
const ID_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** A photo resource name: places/<id>/photos/<ref>. */
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

/** Returns details for a place given its ID or, failing that, free text (resolved to its top match first). */
export async function placeDetails(
  g: Google,
  place: string,
  o: { near?: string; photos: number },
): Promise<DetailsResult> {
  const id = asPlaceId(place) ?? (await resolveId(g, place, o.near));
  const fields = [...DETAIL_FIELDS, ...(o.photos > 0 ? ["photos"] : [])];
  const raw = (await request(g, {
    api: "places",
    method: "GET",
    path: `/places/${id}`,
    query: { languageCode: g.config.language, regionCode: g.config.region },
    fieldMask: fields.join(","),
  })) as RawPlace;
  const base = toPlace({ ...raw, id: raw.id ?? id });
  if (!base) throw new GoogleError(`Google returned no details for ${id}.`);
  const out: DetailsResult = { ...base };
  const short = cleanText(raw.shortFormattedAddress, 200);
  if (short) out.address = out.address ?? short;
  const types = (raw.types ?? []).filter((t) => /^[a-z0-9_]+$/.test(t));
  if (types.length) out.types = types;
  if (raw.timeZone?.id) out.timeZone = cleanText(raw.timeZone.id, 60);
  const access = Object.entries(raw.accessibilityOptions ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  if (access.length) out.accessibility = access;
  const photos = (raw.photos ?? [])
    .filter((p) => p.name && PHOTO_NAME.test(p.name))
    .slice(0, o.photos)
    .map((p) => ({
      name: p.name as string,
      ...(p.widthPx ? { widthPx: p.widthPx } : {}),
      ...(p.heightPx ? { heightPx: p.heightPx } : {}),
      ...(cleanText(p.authorAttributions?.[0]?.displayName, 80)
        ? { author: cleanText(p.authorAttributions?.[0]?.displayName, 80) }
        : {}),
    }));
  if (photos.length) out.photos = photos;
  return out;
}

/** Returns the short-lived image URL for a photo reference from `details`. */
export async function photoUri(g: Google, name: string, maxWidthPx: number): Promise<string> {
  if (!PHOTO_NAME.test(name)) {
    throw new GoogleError('Photo must be a reference from details, like "places/<id>/photos/<ref>".');
  }
  const json = (await request(g, {
    api: "places",
    method: "GET",
    path: `/${name}/media`,
    query: { maxWidthPx, skipHttpRedirect: true },
  })) as { photoUri?: string };
  if (typeof json?.photoUri !== "string" || !json.photoUri.startsWith("https://")) {
    throw new GoogleError("Google returned no photo URL.");
  }
  return json.photoUri;
}

/** Resolves free text to up to `limit` candidate places. */
export async function resolvePlaces(
  g: Google,
  text: string,
  o: { near?: string; limit: number },
): Promise<{ center: Center; places: PlaceOut[] }> {
  const center = await resolveCenter(g, o.near);
  const places = await searchText(g, { query: text, center, radiusM: 20_000, rank: "relevance", limit: o.limit });
  return { center, places };
}

/** Finds places near a point, by category. */
export async function searchNearby(
  g: Google,
  o: {
    center: LatLng;
    radiusM: number;
    types: string[];
    exclude: string[];
    rank: "popularity" | "distance";
    limit: number;
  },
): Promise<PlaceOut[]> {
  const body: Record<string, unknown> = {
    includedTypes: o.types,
    maxResultCount: o.limit,
    rankPreference: o.rank === "distance" ? "DISTANCE" : "POPULARITY",
    languageCode: g.config.language,
    regionCode: g.config.region,
    locationRestriction: circle(o.center, o.radiusM),
  };
  if (o.exclude.length) body.excludedTypes = o.exclude;
  const json = (await request(g, {
    api: "places",
    method: "POST",
    path: "/places:searchNearby",
    fieldMask: LIST_FIELDS.map((f) => `places.${f}`).join(","),
    body,
  })) as { places?: RawPlace[] } | undefined;
  return placesFrom(json, o.center);
}

/** Text search, biased toward a circle around `center`. */
export async function searchText(
  g: Google,
  o: { query: string; center: LatLng; radiusM: number; type?: string; rank: "relevance" | "distance"; limit: number },
): Promise<PlaceOut[]> {
  const body: Record<string, unknown> = {
    textQuery: o.query,
    maxResultCount: o.limit,
    rankPreference: o.rank === "distance" ? "DISTANCE" : "RELEVANCE",
    languageCode: g.config.language,
    regionCode: g.config.region,
    locationBias: circle(o.center, o.radiusM),
  };
  if (o.type) body.includedType = o.type;
  const json = (await request(g, {
    api: "places",
    method: "POST",
    path: "/places:searchText",
    fieldMask: LIST_FIELDS.map((f) => `places.${f}`).join(","),
    body,
  })) as { places?: RawPlace[] } | undefined;
  return placesFrom(json, o.center);
}

/**
 * Resolves `near` to coordinates: absent or "home" is the home area, "lat,lng" is used as is, anything else is
 * looked up as a place (top text-search match).
 */
export async function resolveCenter(g: Google, near?: string): Promise<Center> {
  const text = near?.trim();
  if (!text || text.toLowerCase() === "home") return { ...g.config.home, label: "home area" };
  const point = parseLatLng(text);
  if (point) return { ...point, label: `${point.lat},${point.lng}` };
  const json = (await request(g, {
    api: "places",
    method: "POST",
    path: "/places:searchText",
    fieldMask: "places.id,places.displayName,places.formattedAddress,places.location",
    body: {
      textQuery: text,
      maxResultCount: 1,
      languageCode: g.config.language,
      regionCode: g.config.region,
      locationBias: circle(g.config.home, 50_000),
    },
  })) as { places?: RawPlace[] } | undefined;
  const hit = json?.places?.[0];
  const lat = hit?.location?.latitude;
  const lng = hit?.location?.longitude;
  if (lat === undefined || lng === undefined) throw new GoogleError(`Couldn't find "${text}" to search near.`);
  return { lat, lng, label: cleanText(hit?.displayName?.text, 120) ?? text };
}

/** Normalizes a raw Google place into our output shape (undefined without an ID). */
export function toPlace(raw: RawPlace, from?: LatLng): PlaceOut | undefined {
  if (!raw.id) return undefined;
  const place: PlaceOut = { id: raw.id, name: cleanText(raw.displayName?.text, 200) ?? "(unnamed)" };
  const address = cleanText(raw.formattedAddress, 300);
  if (address) place.address = address;
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  if (lat !== undefined && lng !== undefined) {
    place.lat = lat;
    place.lng = lng;
    if (from) place.distanceM = distanceMeters(from, { lat, lng });
  }
  const type = cleanText(raw.primaryTypeDisplayName?.text, 80);
  if (type) place.type = type;
  if (raw.businessStatus && raw.businessStatus !== "OPERATIONAL") place.status = raw.businessStatus;
  if (raw.googleMapsUri?.startsWith("https://")) place.mapsUrl = raw.googleMapsUri;
  return place;
}

/** Returns the bare place ID when `text` is one ("places/ID" or a long ID-looking token), else undefined. */
export function asPlaceId(text: string): string | undefined {
  const t = text.trim().replace(/^places\//, "");
  return ID_SEGMENT.test(t) && (t.startsWith("ChIJ") || t.length >= 20) ? t : undefined;
}

/** A circle for locationBias / locationRestriction. */
function circle(center: LatLng, radiusM: number) {
  return { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } };
}

/** Maps a places response to our shape, dropping entries without an ID. */
function placesFrom(json: { places?: RawPlace[] } | undefined, from: LatLng): PlaceOut[] {
  return (json?.places ?? []).map((p) => toPlace(p, from)).filter((p): p is PlaceOut => p !== undefined);
}

/** Finds the top text-search match's ID (an IDs-only request, which Google doesn't bill). */
async function resolveId(g: Google, text: string, near?: string): Promise<string> {
  const center = await resolveCenter(g, near);
  const json = (await request(g, {
    api: "places",
    method: "POST",
    path: "/places:searchText",
    fieldMask: "places.id",
    body: {
      textQuery: text,
      maxResultCount: 1,
      languageCode: g.config.language,
      regionCode: g.config.region,
      locationBias: circle(center, 20_000),
    },
  })) as { places?: RawPlace[] } | undefined;
  const id = json?.places?.[0]?.id;
  if (!id || !ID_SEGMENT.test(id)) throw new GoogleError(`No place found for "${text}".`);
  return id;
}
