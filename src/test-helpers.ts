/*
Test helpers: a recording mock transport and an app wired to it (no network).
*/

import { argsbarg } from "argsbarg";
import { app } from "./app.ts";
import { DEFAULT_HOME, type PlacesConfig } from "./config.ts";
import type { Google, Http, HttpRequest, HttpResponse } from "./google/client.ts";

/** Config used by tests: a fake key and the default home area. */
export const TEST_CONFIG: PlacesConfig = {
  apiKey: "test-key-123",
  home: DEFAULT_HOME,
  region: "ie",
  language: "en",
  timeZone: "Europe/Dublin",
};

/** A mock transport that records each request. */
export type MockHttp = Http & { calls: HttpRequest[] };

/** Builds an app whose commands use `http` and `config` instead of the network and environment. */
export function appWithHttp(http: Http, config: PlacesConfig = TEST_CONFIG) {
  return argsbarg({
    ...app.spec,
    hooks: {
      beforeInvoke: (ctx) => {
        ctx.locals.http = http;
        ctx.locals.config = () => config;
      },
    },
  });
}

/** The `Google` handle for calling the google/ modules directly in tests. */
export function testGoogle(http: Http, config: PlacesConfig = TEST_CONFIG): Google {
  return { http, config };
}

/** Returns a transport that records requests and answers with `reply(req)`: a body (status 200) or a full response. */
export function mockHttp(reply: (req: HttpRequest) => unknown | HttpResponse): MockHttp {
  const calls: HttpRequest[] = [];
  const http = async (req: HttpRequest): Promise<HttpResponse> => {
    calls.push(req);
    const out = reply(req);
    if (out && typeof out === "object" && "status" in out && "json" in out) return out as HttpResponse;
    return { status: 200, json: out };
  };
  return Object.assign(http, { calls });
}
