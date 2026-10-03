import type { ActiveBlock, Corridor, LiveTrainState } from '../api/types';

export type Coordinate = [number, number];
export function boundsForCoordinates(points: Coordinate[]): [Coordinate, Coordinate] | null {
  const valid = points.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (!valid.length) return null;
  return [[Math.min(...valid.map(p => p[0])), Math.min(...valid.map(p => p[1]))],
    [Math.max(...valid.map(p => p[0])), Math.max(...valid.map(p => p[1]))]];
}

export function getBlockPath(block: ActiveBlock, corridors: Corridor[]): Coordinate[] {
  if (block.decision.block_geometry?.length) return block.decision.block_geometry;
  const corridor = corridors.find(c => c.stations.some(s => s.code === block.request.from_station)
    && c.stations.some(s => s.code === block.request.to_station));
  if (!corridor) return [];
  const from = corridor.stations.findIndex(s => s.code === block.request.from_station);
  const to = corridor.stations.findIndex(s => s.code === block.request.to_station);
  const stations = corridor.stations.slice(Math.min(from, to), Math.max(from, to) + 1);
  return (from > to ? stations.reverse() : stations).map(s => [s.lon, s.lat]);
}

export interface TrainCluster { position: Coordinate; trains: LiveTrainState[] }
export function clusterTrains(trains: LiveTrainState[], project: (point: Coordinate) => number[], cellSize: number, selected?: string | null): TrainCluster[] {
  const groups: { cluster: TrainCluster; x: number; y: number; selected: boolean }[] = [];
  for (const train of trains) {
    const position: Coordinate = [train.lon, train.lat];
    if (!position.every(Number.isFinite)) continue;
    const [x, y] = project(position);
        // Distance, not cell boundaries: markers on either side of a grid edge must not overlap.
    const isSelected = train.train_number === selected;
    const group = cellSize > 0 && !isSelected
      ? groups.find((g) => !g.selected && Math.hypot(g.x - x, g.y - y) < cellSize)
      : undefined;
    if (group) group.cluster.trains.push(train);
    else groups.push({ cluster: { position, trains: [train] }, x, y, selected: isSelected });
  }
  return groups.map((g) => g.cluster);;
}

// Code-native train glyph: lit cab, two windows, wheels and a directional nose.
export const TRAIN_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="white" d="M32 3 24 13h16zM23 16h18a6 6 0 0 1 6 6v28a7 7 0 0 1-7 7H24a7 7 0 0 1-7-7V22a6 6 0 0 1 6-6Z"/><path fill="#102330" d="M22 25h8v13h-8zm12 0h8v13h-8zM23 43h18v4H23z"/><circle cx="23" cy="51" r="2" fill="#102330"/><circle cx="41" cy="51" r="2" fill="#102330"/><path stroke="white" stroke-width="3" d="m24 56-4 6m20-6 4 6"/></svg>')}`;
