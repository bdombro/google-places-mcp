/* End-to-end command runs through the app's CLI path with a mock transport: no network. */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { schemaStrictnessWarnings } from "argsbarg";
import { app } from "../app.ts";
import { appWithHttp, mockHttp, TEST_CONFIG } from "../test-helpers.ts";
import { UNTRUSTED_NOTICE } from "../util.ts";

const PLACE = {
  id: "ChIJabc123",
  displayName: { text: "Maynooth Dental" },
  formattedAddress: "1 Main St, Maynooth",
  location: { latitude: 53.382, longitude: -6.59 },
  primaryTypeDisplayName: { text: "Dentist" },
};

/** Runs a command line as an MCP call would (structured body) and returns the result and its body. */
async function run(http: ReturnType<typeof mockHttp>, argv: string[]) {
  const result = await appWithHttp(http).invoke(argv, { invocation: "mcp" });
  return { result, json: result.kind === "error" ? undefined : result.response?.body };
}

describe("app", () => {
  test("input schemas are strict and every tool is registered", () => {
    assert.deepEqual(schemaStrictnessWarnings(app.spec), []);
    const commands = (app.spec as unknown as { commands: { key: string }[] }).commands;
    assert.deepEqual(commands.map((c) => c.key).sort(), [
      "details",
      "geocode",
      "matrix",
      "nearby",
      "photo",
      "resolve",
      "route",
      "search",
      "status",
    ]);
  });
});

describe("search", () => {
  test("returns places near the home area with the untrusted notice", async () => {
    const http = mockHttp(() => ({ places: [PLACE] }));
    const { json } = await run(http, ["search", "dentist"]);
    const body = json as { near: string; places: { name: string }[]; notice: string };
    assert.equal(body.near, "home area");
    assert.equal(body.places[0]?.name, "Maynooth Dental");
    assert.equal(body.notice, UNTRUSTED_NOTICE);
    assert.equal(http.calls.length, 1);
  });

  test("resolves a named --near first, and refuses filters that need pricier tiers", async () => {
    const http = mockHttp((req) =>
      (req.body as { textQuery: string }).textQuery === "the school"
        ? { places: [{ id: "s", displayName: { text: "School" }, location: { latitude: 53.4, longitude: -6.6 } }] }
        : { places: [PLACE] },
    );
    const { json } = await run(http, ["search", "dentist", "--near", "the school", "--rank", "distance", "--json"]);
    assert.equal((json as { near: string }).near, "School");
    assert.equal(http.calls.length, 2);
    const bad = await run(http, ["search", "dentist", "--openNow"]);
    assert.equal(bad.result.kind, "error");
  });

  test("plain text output lists names and IDs", async () => {
    const http = mockHttp(() => ({ places: [PLACE] }));
    const result = await appWithHttp(http).invoke(["search", "dentist"], { invocation: "cli" });
    assert.match(result.stdout, /1\. Maynooth Dental — 1 Main St, Maynooth \(Dentist/);
    assert.match(result.stdout, /ChIJabc123/);
  });

  test("a disabled API is an error that says how to enable it", async () => {
    const http = mockHttp(() => ({
      status: 403,
      json: {
        error: { details: [{ reason: "SERVICE_DISABLED", metadata: { activationUrl: "https://example.test/on" } }] },
      },
    }));
    const { result } = await run(http, ["search", "dentist"]);
    assert.equal(result.kind, "error");
    assert.match(`${result.stderr}${result.stdout}`, /not enabled.*https:\/\/example\.test\/on/);
  });
});

describe("nearby, resolve and details", () => {
  test("nearby needs types", async () => {
    const http = mockHttp(() => ({ places: [PLACE] }));
    assert.equal((await run(http, ["nearby"])).result.kind, "error");
    const ok = await run(http, ["nearby", "--types", "dentist,doctor", "--radius", "1000", "--json"]);
    assert.equal((ok.json as { places: unknown[] }).places.length, 1);
    const sent = http.calls[0]?.body as { includedTypes: string[] } | undefined;
    assert.deepEqual(sent?.includedTypes, ["dentist", "doctor"]);
  });

  test("resolve returns candidates", async () => {
    const http = mockHttp(() => ({ places: [PLACE, { ...PLACE, id: "ChIJother99" }] }));
    const { json } = await run(http, ["resolve", "Maynooth Dental", "--limit", "2", "--json"]);
    assert.equal((json as { places: unknown[] }).places.length, 2);
  });

  test("details returns the place and notice, and no Enterprise fields", async () => {
    const http = mockHttp(() => ({ ...PLACE, timeZone: { id: "Europe/Dublin" }, types: ["dentist"] }));
    const { json } = await run(http, ["details", "ChIJabc123", "--json"]);
    const body = json as { place: Record<string, unknown>; notice: string };
    assert.equal(body.place.timeZone, "Europe/Dublin");
    assert.equal(body.notice, UNTRUSTED_NOTICE);
    for (const key of ["rating", "reviews", "phone", "website", "hours", "openNow"]) {
      assert.equal(key in body.place, false);
    }
  });
});

describe("route, matrix and geocode", () => {
  test("route returns the best route", async () => {
    const http = mockHttp(() => ({ routes: [{ duration: "1200s", distanceMeters: 15_000, description: "N4" }] }));
    const { json } = await run(http, ["route", "home", "Dublin Airport", "--json"]);
    const body = json as { mode: string; routes: { duration: string; distance: string }[] };
    assert.equal(body.mode, "drive");
    assert.deepEqual([body.routes[0]?.duration, body.routes[0]?.distance], ["20 min", "15 km"]);
  });

  test("route reports a past departure before calling Google", async () => {
    const http = mockHttp(() => ({ routes: [] }));
    const { result } = await run(http, ["route", "a", "b", "--departAt", "2020-01-01T08:00"]);
    assert.equal(result.kind, "error");
    assert.match(`${result.stderr}${result.stdout}`, /in the past/);
    assert.equal(http.calls.length, 0);
  });

  test("matrix takes pipe-separated lists", async () => {
    const http = mockHttp(() => [
      { originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "60s", distanceMeters: 500 },
    ]);
    const { json } = await run(http, ["matrix", "--origins", "home | School", "--destinations", "A|B", "--json"]);
    const sent = http.calls[0]?.body as { origins: unknown[]; destinations: unknown[] };
    assert.equal(sent.origins.length, 2);
    assert.equal(sent.destinations.length, 2);
    assert.equal((json as { elements: unknown[] }).elements.length, 1);
  });

  test("geocode maps results, treats ZERO_RESULTS as empty, and reverse-geocodes coordinates", async () => {
    const hit = mockHttp(() => ({
      status: "OK",
      results: [
        {
          formatted_address: "Main St, Maynooth",
          geometry: { location: { lat: 53.38, lng: -6.59 }, location_type: "ROOFTOP" },
          place_id: "p1",
          types: ["street_address"],
        },
      ],
    }));
    const { json } = await run(hit, ["geocode", "Main Street Maynooth", "--json"]);
    const body = json as { results: { address: string; precision: string }[] };
    assert.deepEqual([body.results[0]?.address, body.results[0]?.precision], ["Main St, Maynooth", "ROOFTOP"]);
    const none = mockHttp(() => ({ status: "ZERO_RESULTS", results: [] }));
    assert.deepEqual((await run(none, ["geocode", "zzzzzz", "--json"])).json, { results: [] });
    const reverse = mockHttp(() => ({ status: "OK", results: [] }));
    await run(reverse, ["geocode", "53.38,-6.59", "--json"]);
    assert.match(reverse.calls[0]?.url ?? "", /latlng=53\.38%2C-6\.59/);
  });
});

describe("photo and status", () => {
  test("photo returns the image URL and refuses odd references", async () => {
    const http = mockHttp(() => ({ photoUri: "https://lh3.googleusercontent.com/x" }));
    const ok = await run(http, ["photo", "places/ChIJabc/photos/AUc_1", "--json"]);
    assert.equal((ok.json as { photoUri: string }).photoUri, "https://lh3.googleusercontent.com/x");
    assert.equal((await run(http, ["photo", "places/../x"])).result.kind, "error");
  });

  test("status reports settings without calling Google, and probes only on request", async () => {
    const http = mockHttp((req) => (req.url.includes("/geocode/") ? { status: "OK", results: [] } : {}));
    const plain = await run(http, ["status", "--json"]);
    const body = plain.json as { keyConfigured: boolean; probes?: unknown; home: { lat: number } };
    assert.equal(body.keyConfigured, true);
    assert.equal(body.home.lat, TEST_CONFIG.home.lat);
    assert.equal(body.probes, undefined);
    assert.equal(http.calls.length, 0);

    const probe = await run(http, ["status", "--probe", "--json"]);
    const probes = (probe.json as { probes: Record<string, { ok: boolean }> }).probes;
    assert.deepEqual(
      Object.values(probes).map((p) => p.ok),
      [true, true, true],
    );
    assert.equal(http.calls.length, 3);
  });
});
