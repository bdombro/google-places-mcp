import type { PlacesConfig } from "../config.ts";
import type { Http } from "../google/client.ts";

declare module "argsbarg" {
  interface Locals {
    /** Sends HTTP requests to Google; replaced with a mock in tests. */
    http: Http;
    /** Reads settings from the environment on demand; replaced in tests. */
    config: () => PlacesConfig;
  }
}
