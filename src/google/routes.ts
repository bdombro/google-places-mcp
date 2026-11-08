/*
Routes API calls: one route between two points, or a distance matrix across several.
Traffic-aware driving is opt-in (it is a higher Google tier than the default static estimate).
*/

import {
  cleanText,
  formatDistance,
  formatDuration,
  type LatLng,
  parseGoogleDuration,
  parseLatLng,
  resolveTime,
} from "../util.ts";
import { type Google, GoogleError, request } from "./client.ts";
import { asPlaceId } from "./places.ts";

/** Travel modes accepted by the tools. */
export const MODES = ["drive", "walk", "bicycle", "transit", "two_wheeler"] as const;

/** A travel mode. */
export type Mode = (typeof MODES)[number];

/** One leg step. */
export type RouteStep = {
  instruction?: string;
  distance: string;
  duration: string;
  mode?: string;
  transit?: {
    line?: string;
    vehicle?: string;
    headsign?: string;
    from?: string;
    to?: string;
    stops?: number;
    departs?: string;
    arrives?: string;
  };
};

/** One route. */
export type RouteResult = {
  summary?: string;
  duration: string;
  durationSeconds: number;
  trafficFreeDurationSeconds?: number;
  distance: string;
  distanceMeters: number;
  warnings?: string[];
  steps?: RouteStep[];
};

/** One origin/destination pair of a matrix. */
export type MatrixElement = {
  originIndex: number;
  destinationIndex: number;
  origin: string;
  destination: string;
  routeFound: boolean;
  duration?: string;
  durationSeconds?: number;
  distance?: string;
  distanceMeters?: number;
};

/** Options for one route. */
export type RouteInput = {
  origin: string;
  destination: string;
  mode: Mode;
  departAt?: string;
  arriveBy?: string;
  traffic: boolean;
  avoid: string[];
  alternatives: boolean;
  steps: boolean;
};

/** Options for a matrix. */
export type MatrixInput = {
  origins: string[];
  destinations: string[];
  mode: Mode;
  departAt?: string;
  traffic: boolean;
};

/** Google travel mode names. */
const TRAVEL_MODE: Record<Mode, string> = {
  drive: "DRIVE",
  walk: "WALK",
  bicycle: "BICYCLE",
  transit: "TRANSIT",
  two_wheeler: "TWO_WHEELER",
};

/** Computes one or more routes between two points. */
export async function computeRoute(g: Google, o: RouteInput): Promise<RouteResult[]> {
  const body: Record<string, unknown> = {
    origin: waypoint(o.origin, g.config.home),
    destination: waypoint(o.destination, g.config.home),
    travelMode: TRAVEL_MODE[o.mode],
    units: "METRIC",
    languageCode: g.config.language,
    regionCode: g.config.region,
  };
  if (o.alternatives) body.computeAlternativeRoutes = true;
  applyTiming(g, body, o);
  const mask = [
    "routes.duration",
    "routes.staticDuration",
    "routes.distanceMeters",
    "routes.description",
    "routes.warnings",
    ...(o.steps
      ? [
          "routes.legs.steps.navigationInstruction",
          "routes.legs.steps.distanceMeters",
          "routes.legs.steps.staticDuration",
          "routes.legs.steps.travelMode",
          "routes.legs.steps.transitDetails",
        ]
      : []),
  ];
  const json = (await request(g, {
    api: "routes",
    method: "POST",
    path: "/directions/v2:computeRoutes",
    fieldMask: mask.join(","),
    body,
  })) as { routes?: RawRoute[] } | undefined;
  return (json?.routes ?? []).map((r) => toRoute(r, o.steps)).filter((r): r is RouteResult => r !== undefined);
}

/** Computes travel time and distance for every origin/destination pair. */
export async function computeMatrix(g: Google, o: MatrixInput): Promise<MatrixElement[]> {
  const pairs = o.origins.length * o.destinations.length;
  const limit = o.mode === "transit" ? 100 : 625;
  if (o.origins.length > 25 || o.destinations.length > 25 || pairs > limit) {
    throw new GoogleError(
      `Too many pairs: at most 25 origins, 25 destinations and ${limit} pairs for ${o.mode} (got ${o.origins.length}×${o.destinations.length}).`,
    );
  }
  const body: Record<string, unknown> = {
    origins: o.origins.map((t) => ({ waypoint: waypoint(t, g.config.home) })),
    destinations: o.destinations.map((t) => ({ waypoint: waypoint(t, g.config.home) })),
    travelMode: TRAVEL_MODE[o.mode],
    languageCode: g.config.language,
    regionCode: g.config.region,
  };
  applyTiming(g, body, { ...o, avoid: [], arriveBy: undefined });
  const json = (await request(g, {
    api: "routes",
    method: "POST",
    path: "/distanceMatrix/v2:computeRouteMatrix",
    fieldMask: "originIndex,destinationIndex,status,condition,distanceMeters,duration",
    body,
  })) as RawElement[] | undefined;
  const out: MatrixElement[] = [];
  for (const e of Array.isArray(json) ? json : []) {
    const i = e.originIndex ?? 0;
    const j = e.destinationIndex ?? 0;
    const seconds = parseGoogleDuration(e.duration);
    const found = e.condition === "ROUTE_EXISTS" && seconds !== undefined && typeof e.distanceMeters === "number";
    out.push({
      originIndex: i,
      destinationIndex: j,
      origin: cleanText(o.origins[i], 120) ?? "",
      destination: cleanText(o.destinations[j], 120) ?? "",
      routeFound: found,
      ...(found
        ? {
            duration: formatDuration(seconds),
            durationSeconds: seconds,
            distance: formatDistance(e.distanceMeters as number),
            distanceMeters: e.distanceMeters as number,
          }
        : {}),
    });
  }
  return out.sort((a, b) => a.originIndex - b.originIndex || a.destinationIndex - b.destinationIndex);
}

/**
 * Turns text into a Routes waypoint: "home" or "lat,lng" is a coordinate, a place ID (or "place_id:ID") is a
 * placeId, anything else is an address or place name Google geocodes.
 */
export function waypoint(text: string, home: LatLng): Record<string, unknown> {
  const t = text.trim();
  if (!t) throw new GoogleError("A route point can't be empty.");
  if (t.toLowerCase() === "home") return latLngWaypoint(home);
  const point = parseLatLng(t);
  if (point) return latLngWaypoint(point);
  const id = asPlaceId(t.replace(/^place_id:/, ""));
  if (id) return { placeId: id };
  return { address: t.slice(0, 300) };
}

/** Raw route fields we request. */
type RawRoute = {
  duration?: string;
  staticDuration?: string;
  distanceMeters?: number;
  description?: string;
  warnings?: string[];
  legs?: { steps?: RawStep[] }[];
};

/** Raw step fields we request. */
type RawStep = {
  navigationInstruction?: { instructions?: string };
  distanceMeters?: number;
  staticDuration?: string;
  travelMode?: string;
  transitDetails?: {
    stopDetails?: {
      arrivalStop?: { name?: string };
      departureStop?: { name?: string };
      arrivalTime?: string;
      departureTime?: string;
    };
    transitLine?: { name?: string; nameShort?: string; vehicle?: { type?: string } };
    headsign?: string;
    stopCount?: number;
  };
};

/** Raw matrix element. */
type RawElement = {
  originIndex?: number;
  destinationIndex?: number;
  condition?: string;
  duration?: string;
  distanceMeters?: number;
};

/** Adds departure/arrival time, traffic preference and route modifiers to a request body, validating mode rules. */
function applyTiming(
  g: Google,
  body: Record<string, unknown>,
  o: { mode: Mode; departAt?: string; arriveBy?: string; traffic: boolean; avoid: string[] },
): void {
  const motor = o.mode === "drive" || o.mode === "two_wheeler";
  if (o.departAt && o.arriveBy) throw new GoogleError("Use either departAt or arriveBy, not both.");
  if (o.departAt) {
    if (o.mode === "walk" || o.mode === "bicycle")
      throw new GoogleError("departAt only applies to drive, two_wheeler and transit.");
    body.departureTime = resolveTime(o.departAt, g.config.timeZone);
  }
  if (o.arriveBy) {
    if (o.mode !== "transit") throw new GoogleError("arriveBy only applies to transit.");
    body.arrivalTime = resolveTime(o.arriveBy, g.config.timeZone);
  }
  if (motor && (o.traffic || o.departAt)) body.routingPreference = "TRAFFIC_AWARE";
  if (motor && o.avoid.length) {
    body.routeModifiers = {
      avoidTolls: o.avoid.includes("tolls"),
      avoidHighways: o.avoid.includes("highways"),
      avoidFerries: o.avoid.includes("ferries"),
    };
  }
}

/** A coordinate waypoint. */
function latLngWaypoint(p: LatLng): Record<string, unknown> {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

/** Maps a raw route to our shape (undefined when it lacks duration or distance). */
function toRoute(raw: RawRoute, withSteps: boolean): RouteResult | undefined {
  const seconds = parseGoogleDuration(raw.duration);
  if (seconds === undefined || typeof raw.distanceMeters !== "number") return undefined;
  const route: RouteResult = {
    duration: formatDuration(seconds),
    durationSeconds: seconds,
    distance: formatDistance(raw.distanceMeters),
    distanceMeters: raw.distanceMeters,
  };
  const summary = cleanText(raw.description, 160);
  if (summary) route.summary = summary;
  const free = parseGoogleDuration(raw.staticDuration);
  if (free !== undefined && free !== seconds) route.trafficFreeDurationSeconds = free;
  const warnings = (raw.warnings ?? []).map((w) => cleanText(w, 200)).filter((w): w is string => !!w);
  if (warnings.length) route.warnings = warnings;
  if (withSteps) {
    const steps = (raw.legs ?? []).flatMap((leg) => leg.steps ?? []).map(toStep);
    if (steps.length) route.steps = steps;
  }
  return route;
}

/** Maps a raw step to our shape. */
function toStep(raw: RawStep): RouteStep {
  const step: RouteStep = {
    distance: formatDistance(raw.distanceMeters ?? 0),
    duration: formatDuration(parseGoogleDuration(raw.staticDuration) ?? 0),
  };
  const instruction = cleanText(raw.navigationInstruction?.instructions, 200);
  if (instruction) step.instruction = instruction;
  if (raw.travelMode) step.mode = raw.travelMode.toLowerCase();
  const t = raw.transitDetails;
  if (t) {
    step.transit = {
      ...(cleanText(t.transitLine?.nameShort ?? t.transitLine?.name, 60)
        ? { line: cleanText(t.transitLine?.nameShort ?? t.transitLine?.name, 60) }
        : {}),
      ...(t.transitLine?.vehicle?.type ? { vehicle: t.transitLine.vehicle.type.toLowerCase() } : {}),
      ...(cleanText(t.headsign, 80) ? { headsign: cleanText(t.headsign, 80) } : {}),
      ...(cleanText(t.stopDetails?.departureStop?.name, 80)
        ? { from: cleanText(t.stopDetails?.departureStop?.name, 80) }
        : {}),
      ...(cleanText(t.stopDetails?.arrivalStop?.name, 80)
        ? { to: cleanText(t.stopDetails?.arrivalStop?.name, 80) }
        : {}),
      ...(typeof t.stopCount === "number" ? { stops: t.stopCount } : {}),
      ...(t.stopDetails?.departureTime ? { departs: t.stopDetails.departureTime } : {}),
      ...(t.stopDetails?.arrivalTime ? { arrives: t.stopDetails.arrivalTime } : {}),
    };
  }
  return step;
}
