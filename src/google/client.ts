/*
Google Maps Platform HTTP client: one request helper for the Places (New), Routes and Geocoding APIs.
The transport is injectable (ctx.locals.http) so tests never touch the network, and the API key
never appears in results or errors.
*/

import type { InvokeHookContext } from "argsbarg";
import { type PlacesConfig, readConfig } from "../config.ts";

/** One outgoing request. */
export type HttpRequest = {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

/** A response with its body parsed as JSON (undefined when empty). */
export type HttpResponse = { status: number; json: unknown };

/** Sends one request; replaced with a mock in tests. */
export type Http = (req: HttpRequest) => Promise<HttpResponse>;

/** What a command needs to call Google. */
export type Google = { http: Http; config: PlacesConfig; signal?: AbortSignal };

/** Which Google API a request targets. */
export type Api = "places" | "routes" | "geocode";

/** One API call. */
export type RequestSpec = {
  api: Api;
  method: "GET" | "POST";
  /** Path appended to the API's base URL. */
  path?: string;
  query?: Record<string, string | number | boolean | undefined>;
  /** Response field mask (required by Places and Routes). */
  fieldMask?: string;
  body?: unknown;
};

/** Thrown for any failed Google call; the message is safe to show (no key). */
export class GoogleError extends Error {
  override name = "GoogleError";
}

/** Attaches the real transport and config reader (app `beforeInvoke` hook). */
export function attachGoogle(ctx: InvokeHookContext): void {
  ctx.locals.http ??= fetchHttp;
  ctx.locals.config ??= () => readConfig();
}

/** Real transport: `fetch` with a 20 s timeout. */
export const fetchHttp: Http = async (req) => {
  const timeout = AbortSignal.timeout(20_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: req.method,
      headers: { ...(req.body === undefined ? {} : { "Content-Type": "application/json" }), ...req.headers },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal,
    });
  } catch (error) {
    const err = error as Error;
    throw new GoogleError(
      err.name === "TimeoutError" ? "Google did not answer within 20 s." : `Network error: ${err.message}`,
    );
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
};

/** Builds the `Google` handle for a command from its invocation context. */
export function google(ctx: {
  locals: { http: Http; config: () => PlacesConfig };
  mcp?: { signal?: AbortSignal };
}): Google {
  return { http: ctx.locals.http, config: ctx.locals.config(), signal: ctx.mcp?.signal };
}

/** Calls one Google API and returns its parsed JSON, throwing a GoogleError with a clear message on failure. */
export async function request(g: Google, spec: RequestSpec): Promise<unknown> {
  const key = g.config.apiKey;
  if (!key) {
    throw new GoogleError(
      "GOOGLE_PLACES_API_KEY is not set (GOOGLE_PLACE_API_KEY also works). Add it to your login shell.",
    );
  }
  const url = new URL(BASES[spec.api] + (spec.path ?? ""));
  for (const [k, v] of Object.entries(spec.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {};
  if (spec.api === "geocode") url.searchParams.set("key", key);
  else headers["X-Goog-Api-Key"] = key;
  if (spec.fieldMask) headers["X-Goog-FieldMask"] = spec.fieldMask;

  let res: HttpResponse;
  try {
    res = await g.http({ method: spec.method, url: url.toString(), headers, body: spec.body, signal: g.signal });
  } catch (error) {
    throw new GoogleError(scrub((error as Error).message, key));
  }
  const failure = describeFailure(spec.api, res);
  if (failure) throw new GoogleError(scrub(failure, key));
  return res.json;
}

/** Base URL per API. */
const BASES: Record<Api, string> = {
  places: "https://places.googleapis.com/v1",
  routes: "https://routes.googleapis.com",
  geocode: "https://maps.googleapis.com/maps/api/geocode/json",
};

/** Removes the API key from text bound for the agent. */
function scrub(text: string, key: string): string {
  return key ? text.split(key).join("[key]") : text;
}

/** Explains a failed response in one or two sentences (undefined when the call succeeded). */
function describeFailure(api: Api, res: HttpResponse): string | undefined {
  const body = (res.json ?? {}) as Record<string, unknown>;
  if (api === "geocode") {
    const status = String(body.status ?? "");
    if (res.status < 300 && (status === "OK" || status === "ZERO_RESULTS")) return undefined;
    const message = typeof body.error_message === "string" ? ` ${body.error_message}` : "";
    if (status === "OVER_QUERY_LIMIT" || status === "OVER_DAILY_LIMIT") return `Geocoding quota exceeded.${message}`;
    return `Geocoding failed (${status || `HTTP ${res.status}`}).${message}`;
  }
  if (res.status < 300) return undefined;
  const error = (body.error ?? {}) as {
    message?: string;
    status?: string;
    details?: { reason?: string; metadata?: { activationUrl?: string; serviceTitle?: string } }[];
  };
  const info = error.details?.find((d) => d.reason);
  const title = api === "places" ? "Places API (New)" : "Routes API";
  if (info?.reason === "SERVICE_DISABLED") {
    const url = info.metadata?.activationUrl;
    return `${info.metadata?.serviceTitle ?? title} is not enabled for this API key's Google Cloud project.${url ? ` Enable it at ${url}` : ""}`;
  }
  if (info?.reason === "API_KEY_INVALID" || /api key not valid/i.test(error.message ?? "")) {
    return "Google rejected the API key (invalid, or restricted to other APIs or referrers).";
  }
  if (res.status === 429 || error.status === "RESOURCE_EXHAUSTED") {
    return `Google quota exceeded for ${title}; try again later or raise the quota in Google Cloud.`;
  }
  return `${title} error ${res.status}${error.status ? ` ${error.status}` : ""}: ${error.message ?? "no details"}`;
}
