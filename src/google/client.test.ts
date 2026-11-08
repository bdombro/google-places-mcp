import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readConfig } from "../config.ts";
import { mockHttp, TEST_CONFIG, testGoogle } from "../test-helpers.ts";
import { GoogleError, request } from "./client.ts";

describe("request", () => {
  test("sends the key in a header for Places and Routes, with the field mask", async () => {
    const http = mockHttp(() => ({}));
    await request(testGoogle(http), {
      api: "places",
      method: "POST",
      path: "/places:searchText",
      fieldMask: "places.id",
      body: { textQuery: "x" },
    });
    const call = http.calls[0];
    assert.equal(call?.url, "https://places.googleapis.com/v1/places:searchText");
    assert.equal(call?.headers?.["X-Goog-Api-Key"], TEST_CONFIG.apiKey);
    assert.equal(call?.headers?.["X-Goog-FieldMask"], "places.id");
    assert.ok(!call?.url.includes(TEST_CONFIG.apiKey), "key must not be in the URL");
  });

  test("sends the key as a query parameter for Geocoding", async () => {
    const http = mockHttp(() => ({ status: "OK", results: [] }));
    await request(testGoogle(http), { api: "geocode", method: "GET", query: { address: "Maynooth", region: "ie" } });
    const url = new URL(http.calls[0]?.url ?? "");
    assert.equal(url.searchParams.get("key"), TEST_CONFIG.apiKey);
    assert.equal(url.searchParams.get("address"), "Maynooth");
    assert.equal(http.calls[0]?.headers?.["X-Goog-Api-Key"], undefined);
  });

  test("explains a disabled API and how to enable it", async () => {
    const http = mockHttp(() => ({
      status: 403,
      json: {
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "Places API (New) has not been used in project 1 before or it is disabled.",
          details: [
            {
              reason: "SERVICE_DISABLED",
              metadata: { serviceTitle: "Places API (New)", activationUrl: "https://example.test/enable" },
            },
          ],
        },
      },
    }));
    await assert.rejects(
      request(testGoogle(http), { api: "places", method: "GET", path: "/places/x", fieldMask: "id" }),
      (e: Error) => {
        assert.ok(e instanceof GoogleError);
        assert.match(e.message, /not enabled/);
        assert.match(e.message, /https:\/\/example\.test\/enable/);
        return true;
      },
    );
  });

  test("reports an invalid key, quota and other errors", async () => {
    const bad = mockHttp(() => ({
      status: 400,
      json: { error: { message: "API key not valid. Please pass a valid API key." } },
    }));
    await assert.rejects(
      request(testGoogle(bad), { api: "places", method: "GET", path: "/places/x" }),
      /rejected the API key/,
    );
    const quota = mockHttp(() => ({
      status: 429,
      json: { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } },
    }));
    await assert.rejects(request(testGoogle(quota), { api: "routes", method: "POST", path: "/x" }), /quota exceeded/);
    const other = mockHttp(() => ({ status: 500, json: { error: { status: "INTERNAL", message: "boom" } } }));
    await assert.rejects(
      request(testGoogle(other), { api: "routes", method: "POST", path: "/x" }),
      /Routes API error 500 INTERNAL: boom/,
    );
  });

  test("maps Geocoding status strings to errors, but not ZERO_RESULTS", async () => {
    const denied = mockHttp(() => ({
      status: 200,
      json: { status: "REQUEST_DENIED", error_message: "The provided API key is invalid." },
    }));
    await assert.rejects(request(testGoogle(denied), { api: "geocode", method: "GET" }), /REQUEST_DENIED.*invalid/);
    const none = mockHttp(() => ({ status: 200, json: { status: "ZERO_RESULTS", results: [] } }));
    assert.deepEqual(await request(testGoogle(none), { api: "geocode", method: "GET" }), {
      status: "ZERO_RESULTS",
      results: [],
    });
  });

  test("never leaks the key, even if the transport error contains it", async () => {
    const leaky = mockHttp(() => {
      throw new Error(`connect failed for https://maps.googleapis.com/x?key=${TEST_CONFIG.apiKey}`);
    });
    await assert.rejects(request(testGoogle(leaky), { api: "geocode", method: "GET" }), (e: Error) => {
      assert.ok(!e.message.includes(TEST_CONFIG.apiKey));
      assert.match(e.message, /\[key\]/);
      return true;
    });
  });

  test("fails clearly without a key", async () => {
    const http = mockHttp(() => ({}));
    await assert.rejects(
      request(testGoogle(http, { ...TEST_CONFIG, apiKey: "" }), { api: "places", method: "GET", path: "/places/x" }),
      /GOOGLE_PLACES_API_KEY is not set/,
    );
    assert.equal(http.calls.length, 0);
  });
});

describe("readConfig", () => {
  test("reads either key name, with defaults", () => {
    assert.equal(readConfig({ GOOGLE_PLACE_API_KEY: "abc" }).apiKey, "abc");
    assert.equal(readConfig({ GOOGLE_PLACES_API_KEY: "xyz", GOOGLE_PLACE_API_KEY: "abc" }).apiKey, "xyz");
    const empty = readConfig({});
    assert.equal(empty.apiKey, "");
    assert.equal(empty.region, "ie");
    assert.equal(empty.timeZone, "Europe/Dublin");
  });

  test("PLACES_HOME overrides the home area; bad values fall back", () => {
    assert.deepEqual(readConfig({ PLACES_HOME: "53.1,-6.2" }).home, { lat: 53.1, lng: -6.2 });
    assert.deepEqual(readConfig({ PLACES_HOME: "nowhere" }).home, readConfig({}).home);
  });
});
