import type { GeofenceOutcome, LocationSample } from "../attendance.js";

const EARTH_RADIUS_METRES = 6_371_008.8;

export interface GeofenceCheckInput {
  readonly site: {
    readonly latitude: number;
    readonly longitude: number;
    readonly geofenceRadiusMetres: number;
    readonly gpsAccuracyThresholdMetres: number;
  };
  readonly location: LocationSample | null;
  readonly permissionDenied?: boolean;
}

export interface GeofenceCheckResult {
  readonly outcome: GeofenceOutcome;
  readonly distanceMetres: number | null;
}

/** Great-circle distance in metres between two WGS-84 coordinates. */
export function distanceMetres(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(fromLatitude);
  const lat2 = toRadians(toLatitude);
  const deltaLat = toRadians(toLatitude - fromLatitude);
  const deltaLon = toRadians(toLongitude - fromLongitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Evaluates a single attendance location fix.
 *
 * The result never blocks the worker by itself: an "outside" or "unavailable"
 * outcome records an exception for supervisor review (scope section 8), which
 * keeps a failed GPS read from stopping cleaning work.
 */
export function evaluateGeofence(input: GeofenceCheckInput): GeofenceCheckResult {
  if (input.permissionDenied === true) {
    return { outcome: "permission_denied", distanceMetres: null };
  }

  const location = input.location;
  if (location === null) {
    return { outcome: "unavailable", distanceMetres: null };
  }

  if (location.isMocked) {
    return { outcome: "mock_location_suspected", distanceMetres: null };
  }

  if (location.accuracyMetres > input.site.gpsAccuracyThresholdMetres) {
    return { outcome: "accuracy_rejected", distanceMetres: null };
  }

  const distance = distanceMetres(
    location.latitude,
    location.longitude,
    input.site.latitude,
    input.site.longitude,
  );

  const rounded = Math.round(distance * 100) / 100;
  return {
    outcome: distance <= input.site.geofenceRadiusMetres ? "inside" : "outside",
    distanceMetres: rounded,
  };
}
