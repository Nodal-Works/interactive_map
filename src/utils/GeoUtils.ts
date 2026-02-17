/**
 * Geospatial utility functions
 * Shared across animations that need distance/bearing calculations
 */

import type { GeoCoordinate } from '../types/index.js';

/**
 * Earth's radius in meters
 */
const EARTH_RADIUS_M = 6371000;

/**
 * Calculate the Haversine distance between two geographic coordinates
 * @param point1 First coordinate [lng, lat]
 * @param point2 Second coordinate [lng, lat]
 * @returns Distance in meters
 */
export function distance(
  point1: [number, number] | GeoCoordinate,
  point2: [number, number] | GeoCoordinate
): number {
  const [lon1, lat1] = Array.isArray(point1) ? point1 : [point1.lng, point1.lat];
  const [lon2, lat2] = Array.isArray(point2) ? point2 : [point2.lng, point2.lat];

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Calculate a destination point given origin, distance, and bearing
 * @param origin Starting coordinate
 * @param distanceMeters Distance to travel in meters
 * @param bearingDegrees Bearing in degrees (0 = north, 90 = east)
 * @returns Destination coordinate [lng, lat]
 */
export function destination(
  origin: [number, number] | GeoCoordinate,
  distanceMeters: number,
  bearingDegrees: number
): [number, number] {
  const [lon, lat] = Array.isArray(origin) ? origin : [origin.lng, origin.lat];

  const angularDistance = distanceMeters / EARTH_RADIUS_M;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [toDegrees(lon2), toDegrees(lat2)];
}

/**
 * Calculate bearing from origin to destination
 * @param origin Starting coordinate
 * @param dest Destination coordinate
 * @returns Bearing in degrees (0 = north, 90 = east)
 */
export function bearing(
  origin: [number, number] | GeoCoordinate,
  dest: [number, number] | GeoCoordinate
): number {
  const [lon1, lat1] = Array.isArray(origin) ? origin : [origin.lng, origin.lat];
  const [lon2, lat2] = Array.isArray(dest) ? dest : [dest.lng, dest.lat];

  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);

  const brng = Math.atan2(y, x);
  return (toDegrees(brng) + 360) % 360;
}

/**
 * Interpolate between two geographic coordinates
 * @param start Start coordinate
 * @param end End coordinate
 * @param fraction Interpolation fraction (0 to 1)
 * @returns Interpolated coordinate [lng, lat]
 */
export function interpolate(
  start: [number, number] | GeoCoordinate,
  end: [number, number] | GeoCoordinate,
  fraction: number
): [number, number] {
  const [lon1, lat1] = Array.isArray(start) ? start : [start.lng, start.lat];
  const [lon2, lat2] = Array.isArray(end) ? end : [end.lng, end.lat];

  const lon = lon1 + (lon2 - lon1) * fraction;
  const lat = lat1 + (lat2 - lat1) * fraction;

  return [lon, lat];
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map a value from one range to another
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
