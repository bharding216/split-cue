/**
 * Route outlines for share cards. The start and end of a run are usually the
 * runner's front door, so both are trimmed before anything is drawn.
 */

import type { RoutePoint } from '../workout/workoutTypes';

export const ROUTE_PRIVACY_TRIM_METERS = 200;

/**
 * Drop the first and last `trimMeters` of a route, using each point's
 * cumulative `dist`. Returns an empty route when too little is left to draw.
 */
export function trimRouteForPrivacy(
  route: RoutePoint[],
  trimMeters: number = ROUTE_PRIVACY_TRIM_METERS,
): RoutePoint[] {
  if (route.length < 2) return [];
  const startDist = route[0].dist;
  const endDist = route[route.length - 1].dist;
  if (endDist - startDist <= trimMeters * 3) return [];
  const trimmed = route.filter((p) => p.dist >= startDist + trimMeters && p.dist <= endDist - trimMeters);
  return trimmed.length >= 2 ? trimmed : [];
}

/**
 * Project lat/lng points into a `width` × `height` box (y down), keeping the
 * route's shape, and return an SVG path. Long routes are thinned to at most
 * `maxPoints` points.
 */
export function routeToSvgPath(
  route: Pick<RoutePoint, 'lat' | 'lng'>[],
  width: number,
  height: number,
  padding = 4,
  maxPoints = 400,
): string {
  if (route.length < 2) return '';

  const step = Math.max(1, Math.ceil(route.length / maxPoints));
  const points = route.filter((_, i) => i % step === 0 || i === route.length - 1);

  // Equirectangular projection: scale longitude by cos(latitude).
  const midLat = (points.reduce((s, p) => s + p.lat, 0) / points.length) * (Math.PI / 180);
  const xs = points.map((p) => p.lng * Math.cos(midLat));
  const ys = points.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  if (spanX === 0 && spanY === 0) return '';

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale = Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  const offsetX = padding + (innerW - spanX * scale) / 2;
  const offsetY = padding + (innerH - spanY * scale) / 2;

  return points
    .map((_, i) => {
      const x = offsetX + (xs[i] - minX) * scale;
      const y = offsetY + (ys[i] - minY) * scale;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
