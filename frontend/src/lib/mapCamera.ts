import { WebMercatorViewport } from "@deck.gl/core";

type Point = [number, number];
export type CameraPadding = { top: number; right: number; bottom: number; left: number };

/** Fit the projected envelope, including the raised block edge, inside the HUD. */
export function fitCinematicBounds(
  points: Point[], width: number, height: number,
  padding: CameraPadding, pitch = 42, bearing = -12,
) {
  const valid = points.filter((p) => p.every(Number.isFinite));
  if (!valid.length || width <= padding.left + padding.right || height <= padding.top + padding.bottom) return null;
  const bounds: [Point, Point] = [
    [Math.min(...valid.map((p) => p[0])), Math.min(...valid.map((p) => p[1]))],
    [Math.max(...valid.map((p) => p[0])), Math.max(...valid.map((p) => p[1]))],
  ];
  const flat = new WebMercatorViewport({ width, height }).fitBounds(bounds, { padding, maxZoom: 12 });
  let camera = { longitude: flat.longitude, latitude: flat.latitude, zoom: flat.zoom, pitch, bearing };
  // Include all envelope corners, not just endpoints; their screen extrema change with bearing.
  const envelope = [bounds[0], bounds[1], [bounds[0][0], bounds[1][1]], [bounds[1][0], bounds[0][1]]];
  const availableWidth = width - padding.left - padding.right;
  const availableHeight = height - padding.top - padding.bottom;
  const target = [padding.left + availableWidth / 2, padding.top + availableHeight / 2];
  for (let i = 0; i < 16; i++) {
    const viewport = new WebMercatorViewport({ width, height, ...camera });
    const projected = envelope.flatMap((p) => [viewport.project([...p, 0]), viewport.project([...p, pitch ? 5500 : 0])]);
    const x0 = Math.min(...projected.map((p) => p[0]));
    const x1 = Math.max(...projected.map((p) => p[0]));
    const y0 = Math.min(...projected.map((p) => p[1]));
    const y1 = Math.max(...projected.map((p) => p[1]));
    const center = viewport.unproject([(x0 + x1) / 2, (y0 + y1) / 2]);
    const panned = viewport.panByPosition([center[0], center[1]], target);
    const scale = Math.min(availableWidth * 0.92 / Math.max(1, x1 - x0), availableHeight * 0.92 / Math.max(1, y1 - y0));
    camera = { ...camera, longitude: panned.longitude!, latitude: panned.latitude!, zoom: Math.min(12, camera.zoom + Math.log2(scale)) };
    if (Math.abs(scale - 1) < 0.001 && Math.abs((x0 + x1) / 2 - target[0]) < 1 && Math.abs((y0 + y1) / 2 - target[1]) < 1) break;
  }
  return camera;
}
