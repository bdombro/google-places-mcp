import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mockHttp, testGoogle } from "../test-helpers.ts";
import { computeMatrix, computeRoute, waypoint } from "./routes.ts";

const HOME = { lat: 53.3813, lng: -6.5918 };

const BASE = { mode: "drive" as const, traffic: false, avoid: [], alternatives: false, steps: false };

describe("waypoint", () => {
  test("home, coordinates, place IDs and addresses", () => {
    assert.deepEqual(waypoint("home", HOME), { location: { latLng: { latitude: HOME.lat, longitude: HOME.lng } } });
    assert.deepEqual(waypoint("53.4, -6.2", HOME), { location: { latLng: { latitude: 53.4, longitude: -6.2 } } });
    assert.deepEqual(waypoint("ChIJabc123", HOME), { placeId: "ChIJabc123" });
    assert.deepEqual(waypoint("place_id:ChIJabc123", HOME), { placeId: "ChIJabc123" });
    assert.deepEqual(waypoint("Dublin Airport", HOME), { address: "Dublin Airport" });
    assert.throws(() => waypoint("  ", HOME), /can't be empty/);
  });
});

describe("computeRoute", () => {
  const reply = {
    routes: [
      {
        duration: "2280s",
        staticDuration: "2100s",
        distanceMeters: 41_400,
        description: "M4",
        warnings: ["Toll road​ ahead"],
      },
    ],
  };

  test("static by default: no routing preference, minimal field mask", async () => {
    const http = mockHttp(() => reply);
    const routes = await computeRoute(testGoogle(http), { ...BASE, origin: "home", destination: "Dublin Airport" });
    const call = http.calls[0];
    const body = call?.body as Record<string, unknown>;
    assert.equal(call?.url, "https://routes.googleapis.com/directions/v2:computeRoutes");
    assert.equal(body.travelMode, "DRIVE");
    assert.equal(body.routingPreference, undefined);
    assert.equal(body.units, "METRIC");
    assert.ok(!(call?.headers?.["X-Goog-FieldMask"] ?? "").includes("steps"));
    assert.equal(routes[0]?.duration, "38 min");
    assert.equal(routes[0]?.distance, "41 km");
    assert.equal(routes[0]?.trafficFreeDurationSeconds, 2100);
    assert.deepEqual(routes[0]?.warnings, ["Toll road ahead"]);
  });

  test("traffic or departAt turns on traffic-aware routing; avoid becomes route modifiers", async () => {
    const http = mockHttp(() => reply);
    await computeRoute(testGoogle(http), {
      ...BASE,
      origin: "a",
      destination: "b",
      traffic: true,
      avoid: ["tolls", "ferries"],
    });
    const body = http.calls[0]?.body as Record<string, unknown>;
    assert.equal(body.routingPreference, "TRAFFIC_AWARE");
    assert.deepEqual(body.routeModifiers, { avoidTolls: true, avoidHighways: false, avoidFerries: true });

    const timed = mockHttp(() => reply);
    await computeRoute(testGoogle(timed), { ...BASE, origin: "a", destination: "b", departAt: "2099-01-01T08:00:00Z" });
    const tb = timed.calls[0]?.body as Record<string, unknown>;
    assert.equal(tb.routingPreference, "TRAFFIC_AWARE");
    assert.equal(tb.departureTime, "2099-01-01T08:00:00.000Z");
  });

  test("walking has no traffic or modifiers, and departAt is refused", async () => {
    const http = mockHttp(() => reply);
    await computeRoute(testGoogle(http), {
      ...BASE,
      mode: "walk",
      origin: "a",
      destination: "b",
      traffic: true,
      avoid: ["tolls"],
    });
    const body = http.calls[0]?.body as Record<string, unknown>;
    assert.equal(body.travelMode, "WALK");
    assert.equal(body.routingPreference, undefined);
    assert.equal(body.routeModifiers, undefined);
    await assert.rejects(
      computeRoute(testGoogle(http), {
        ...BASE,
        mode: "walk",
        origin: "a",
        destination: "b",
        departAt: "2099-01-01T08:00:00Z",
      }),
      /departAt only applies/,
    );
  });

  test("arriveBy is transit-only and exclusive with departAt", async () => {
    const http = mockHttp(() => reply);
    await assert.rejects(
      computeRoute(testGoogle(http), { ...BASE, origin: "a", destination: "b", arriveBy: "2099-01-01T08:00:00Z" }),
      /arriveBy only applies to transit/,
    );
    await assert.rejects(
      computeRoute(testGoogle(http), {
        ...BASE,
        mode: "transit",
        origin: "a",
        destination: "b",
        arriveBy: "2099-01-01T08:00:00Z",
        departAt: "2099-01-01T07:00:00Z",
      }),
      /either departAt or arriveBy/,
    );
    await computeRoute(testGoogle(http), {
      ...BASE,
      mode: "transit",
      origin: "a",
      destination: "b",
      arriveBy: "2099-01-01T08:00:00Z",
    });
    assert.equal((http.calls[0]?.body as Record<string, unknown> | undefined)?.arrivalTime, "2099-01-01T08:00:00.000Z");
  });

  test("steps add transit details to the mask and the result", async () => {
    const http = mockHttp(() => ({
      routes: [
        {
          duration: "1800s",
          distanceMeters: 20_000,
          legs: [
            {
              steps: [
                {
                  navigationInstruction: { instructions: "Walk to the stop" },
                  distanceMeters: 200,
                  staticDuration: "120s",
                  travelMode: "WALK",
                },
                {
                  distanceMeters: 19_000,
                  staticDuration: "1500s",
                  travelMode: "TRANSIT",
                  transitDetails: {
                    stopDetails: { departureStop: { name: "Maynooth" }, arrivalStop: { name: "Connolly" } },
                    transitLine: { nameShort: "M3", vehicle: { type: "HEAVY_RAIL" } },
                    headsign: "Dublin",
                    stopCount: 9,
                  },
                },
              ],
            },
          ],
        },
      ],
    }));
    const routes = await computeRoute(testGoogle(http), {
      ...BASE,
      mode: "transit",
      origin: "a",
      destination: "b",
      steps: true,
    });
    assert.match(http.calls[0]?.headers?.["X-Goog-FieldMask"] ?? "", /transitDetails/);
    assert.equal(routes[0]?.steps?.length, 2);
    assert.deepEqual(routes[0]?.steps?.[1]?.transit, {
      line: "M3",
      vehicle: "heavy_rail",
      headsign: "Dublin",
      from: "Maynooth",
      to: "Connolly",
      stops: 9,
    });
  });

  test("no route yields an empty list", async () => {
    assert.deepEqual(
      await computeRoute(testGoogle(mockHttp(() => ({}))), { ...BASE, origin: "a", destination: "b" }),
      [],
    );
  });
});

describe("computeMatrix", () => {
  test("builds waypoints, orders elements and marks missing routes", async () => {
    const http = mockHttp(() => [
      { originIndex: 1, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "600s", distanceMeters: 5000 },
      { originIndex: 0, destinationIndex: 1, condition: "ROUTE_NOT_FOUND" },
      { originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "300s", distanceMeters: 2500 },
    ]);
    const els = await computeMatrix(testGoogle(http), {
      mode: "drive",
      traffic: false,
      origins: ["home", "School"],
      destinations: ["Clinic A", "Clinic B"],
    });
    const body = http.calls[0]?.body as { origins: { waypoint: unknown }[]; destinations: unknown[] };
    assert.equal(http.calls[0]?.url, "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix");
    assert.equal(body.origins.length, 2);
    assert.deepEqual(body.origins[1]?.waypoint, { address: "School" });
    assert.deepEqual(
      els.map((e) => [e.originIndex, e.destinationIndex, e.routeFound]),
      [
        [0, 0, true],
        [0, 1, false],
        [1, 0, true],
      ],
    );
    assert.equal(els[0]?.duration, "5 min");
    assert.equal(els[0]?.destination, "Clinic A");
    assert.equal(els[1]?.duration, undefined);
  });

  test("enforces size limits before calling Google", async () => {
    const http = mockHttp(() => []);
    const many = Array.from({ length: 11 }, (_, i) => `p${i}`);
    await assert.rejects(
      computeMatrix(testGoogle(http), { mode: "transit", traffic: false, origins: many, destinations: many }),
      /Too many pairs/,
    );
    await assert.rejects(
      computeMatrix(testGoogle(http), {
        mode: "drive",
        traffic: false,
        origins: Array.from({ length: 26 }, (_, i) => `p${i}`),
        destinations: ["x"],
      }),
      /Too many pairs/,
    );
    assert.equal(http.calls.length, 0);
  });
});
