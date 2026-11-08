import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  cleanText,
  distanceMeters,
  formatDistance,
  formatDuration,
  parseGoogleDuration,
  parseLatLng,
  priceSymbols,
  resolveTime,
} from "./util.ts";

describe("parseLatLng", () => {
  test("reads comma and space separated pairs", () => {
    assert.deepEqual(parseLatLng("53.3813,-6.5918"), { lat: 53.3813, lng: -6.5918 });
    assert.deepEqual(parseLatLng(" 53.38 , -6.59 "), { lat: 53.38, lng: -6.59 });
    assert.deepEqual(parseLatLng("53 -6"), { lat: 53, lng: -6 });
  });

  test("rejects names and out-of-range values", () => {
    assert.equal(parseLatLng("Maynooth"), undefined);
    assert.equal(parseLatLng("91,0"), undefined);
    assert.equal(parseLatLng("0,181"), undefined);
    assert.equal(parseLatLng("12 Main Street"), undefined);
  });
});

describe("cleanText", () => {
  test("strips control, zero-width and line-separator characters and caps length", () => {
    assert.equal(cleanText("A\u0000B​C‮D\nE"), "A B C D E");
    assert.equal(cleanText("   "), undefined);
    assert.equal(cleanText(undefined), undefined);
    assert.equal(cleanText("x".repeat(50), 10), `${"x".repeat(9)}…`);
  });
});

describe("distance and duration formatting", () => {
  test("distanceMeters is roughly right", () => {
    // Maynooth to Dublin Airport is about 33 km as the crow flies.
    const d = distanceMeters({ lat: 53.3813, lng: -6.5918 }, { lat: 53.4264, lng: -6.2499 });
    assert.ok(d > 22_000 && d < 26_000, `got ${d}`);
    assert.equal(distanceMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
  });

  test("formatDistance", () => {
    assert.equal(formatDistance(450), "450 m");
    assert.equal(formatDistance(3200), "3.2 km");
    assert.equal(formatDistance(41_400), "41 km");
  });

  test("formatDuration", () => {
    assert.equal(formatDuration(10), "<1 min");
    assert.equal(formatDuration(18 * 60), "18 min");
    assert.equal(formatDuration(3600), "1 h");
    assert.equal(formatDuration(3900), "1 h 5 min");
  });

  test("parseGoogleDuration", () => {
    assert.equal(parseGoogleDuration("1234s"), 1234);
    assert.equal(parseGoogleDuration("12.6s"), 13);
    assert.equal(parseGoogleDuration("later"), undefined);
    assert.equal(parseGoogleDuration(undefined), undefined);
  });

  test("priceSymbols", () => {
    assert.equal(priceSymbols("PRICE_LEVEL_MODERATE"), "$$");
    assert.equal(priceSymbols("PRICE_LEVEL_FREE"), "free");
    assert.equal(priceSymbols(undefined), undefined);
  });
});

describe("resolveTime", () => {
  const now = new Date("2026-11-08T12:00:00Z"); // Dublin is on GMT (UTC+0) in November.

  test("passes RFC 3339 times through as UTC", () => {
    assert.equal(resolveTime("2026-11-09T08:00:00Z", "Europe/Dublin", now), "2026-11-09T08:00:00.000Z");
    assert.equal(resolveTime("2026-11-09T09:00:00+01:00", "Europe/Dublin", now), "2026-11-09T08:00:00.000Z");
  });

  test("reads local times in the given zone, including summer time", () => {
    assert.equal(resolveTime("2026-12-01T08:00", "Europe/Dublin", now), "2026-12-01T08:00:00.000Z");
    assert.equal(resolveTime("2027-07-01T08:00", "Europe/Dublin", now), "2027-07-01T07:00:00.000Z");
    assert.equal(resolveTime("2026-11-20 08:00", "America/New_York", now), "2026-11-20T13:00:00.000Z");
  });

  test("bare HH:MM means its next occurrence", () => {
    assert.equal(resolveTime("15:30", "Europe/Dublin", now), "2026-11-08T15:30:00.000Z");
    assert.equal(resolveTime("08:00", "Europe/Dublin", now), "2026-11-09T08:00:00.000Z");
  });

  test("rejects the past and nonsense", () => {
    assert.throws(() => resolveTime("2026-11-01T08:00", "Europe/Dublin", now), /past/);
    assert.throws(() => resolveTime("tomorrow morning", "Europe/Dublin", now), /Can't read the time/);
  });
});
