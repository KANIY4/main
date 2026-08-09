import { describe, expect, it } from "vitest";

import { distanceMetres, evaluateGeofence } from "../rules/geofence";
import type { LocationSample } from "../attendance";

const site = {
  latitude: -33.8688,
  longitude: 151.2093,
  geofenceRadiusMetres: 100,
  gpsAccuracyThresholdMetres: 50,
};

function sample(overrides: Partial<LocationSample> = {}): LocationSample {
  return {
    latitude: site.latitude,
    longitude: site.longitude,
    accuracyMetres: 10,
    capturedAt: "2026-08-09T07:00:00+10:00",
    isMocked: false,
    ...overrides,
  };
}

describe("distanceMetres", () => {
  it("returns zero for identical coordinates", () => {
    expect(distanceMetres(site.latitude, site.longitude, site.latitude, site.longitude)).toBe(0);
  });

  it("matches a known separation within one percent", () => {
    // Sydney GPO to Melbourne GPO is approximately 713.5 km.
    const metres = distanceMetres(-33.8688, 151.2093, -37.8136, 144.9631);
    expect(metres).toBeGreaterThan(707_000);
    expect(metres).toBeLessThan(720_000);
  });
});

describe("evaluateGeofence", () => {
  it("reports inside when the worker stands at the site", () => {
    const result = evaluateGeofence({ site, location: sample() });
    expect(result.outcome).toBe("inside");
    expect(result.distanceMetres).toBe(0);
  });

  it("reports outside beyond the radius", () => {
    // Roughly 340 m north of the site.
    const result = evaluateGeofence({ site, location: sample({ latitude: -33.8657 }) });
    expect(result.outcome).toBe("outside");
    expect(result.distanceMetres).toBeGreaterThan(site.geofenceRadiusMetres);
  });

  it("rejects a fix whose accuracy is worse than the site threshold", () => {
    const result = evaluateGeofence({ site, location: sample({ accuracyMetres: 120 }) });
    expect(result.outcome).toBe("accuracy_rejected");
    expect(result.distanceMetres).toBeNull();
  });

  it("flags a mocked location instead of trusting the coordinates", () => {
    const result = evaluateGeofence({ site, location: sample({ isMocked: true }) });
    expect(result.outcome).toBe("mock_location_suspected");
  });

  it("reports unavailable when no fix was obtained", () => {
    expect(evaluateGeofence({ site, location: null }).outcome).toBe("unavailable");
  });

  it("reports permission_denied ahead of any other outcome", () => {
    const result = evaluateGeofence({ site, location: sample(), permissionDenied: true });
    expect(result.outcome).toBe("permission_denied");
  });
});
