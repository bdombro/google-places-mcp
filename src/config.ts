/*
Settings from the environment (no config file): the API key and the home area that biases searches.
*/

import { type LatLng, parseLatLng } from "./util.ts";

/** Maynooth town centre: the default home area (public information; set PLACES_HOME for the house). */
export const DEFAULT_HOME: LatLng = { lat: 53.3813, lng: -6.5918 };

/** Resolved settings. `apiKey` is empty when no key is set. */
export type PlacesConfig = {
  apiKey: string;
  /** Biases searches and resolves the word "home" in routes. */
  home: LatLng;
  /** ISO 3166-1 alpha-2 region bias, lower-case (e.g. "ie"). */
  region: string;
  /** BCP-47 language for names and addresses (e.g. "en"). */
  language: string;
  /** IANA zone for local departure times (e.g. "Europe/Dublin"). */
  timeZone: string;
};

/**
 * Reads settings from `env`: GOOGLE_PLACES_API_KEY (GOOGLE_PLACE_API_KEY also works), PLACES_HOME ("lat,lng"),
 * PLACES_REGION, PLACES_LANGUAGE and PLACES_TIMEZONE.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): PlacesConfig {
  return {
    apiKey: (env.GOOGLE_PLACES_API_KEY || env.GOOGLE_PLACE_API_KEY || "").trim(),
    home: parseLatLng(env.PLACES_HOME ?? "") ?? DEFAULT_HOME,
    region: (env.PLACES_REGION || "ie").toLowerCase(),
    language: env.PLACES_LANGUAGE || "en",
    timeZone: env.PLACES_TIMEZONE || "Europe/Dublin",
  };
}
