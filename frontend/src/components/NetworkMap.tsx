import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { PathLayer, ScatterplotLayer, IconLayer, TextLayer, ColumnLayer } from '@deck.gl/layers';
import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core';
import { Focus, Layers3, Minus, Plus } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ActiveBlock, LiveTrainState } from '../api/types';
import { useSimulation } from '../store/SimulationContext';
import { boundsForCoordinates, clusterTrains, getBlockPath, TRAIN_ICON } from '../lib/mapPresentation';
import type { Coordinate, TrainCluster } from "../lib/mapPresentation";
import { fitCinematicBounds } from "../lib/mapCamera";

export interface MapViewState { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number; transitionDuration?: number; transitionInterpolator?: FlyToInterpolator }
const INITIAL: MapViewState = { longitude: 79, latitude: 22, zoom: 4.3,   pitch: 42,
  bearing: -12, };
const GOLD: [number, number, number, number] = [232, 190, 112, 255];
const CYAN: [number, number, number, number] = [113, 219, 246, 255];
const CORAL: [number, number, number, number] = [255, 124, 110, 255];
const HUBS: Record<string, string> = { NDLS: 'NEW DELHI', BCT: 'MUMBAI', MAS: 'CHENNAI', HWH: 'KOLKATA' };

export function NetworkMap({ trains, onBlockClick, onTrainClick, selectedTrainId, selectedBlockId,
  focusCorridor,
  detailPanelOpen = false, showStations = true, showTrains = true, showBlocks = true, onStationClick }: {
  trains: LiveTrainState[]; onBlockClick?: (block: ActiveBlock) => void;
  onTrainClick?: (train: LiveTrainState) => void; selectedTrainId?: string | null;
  selectedBlockId?: string | null;   focusCorridor?: string;
  detailPanelOpen?: boolean; showStations?: boolean;
  showTrains?: boolean; showBlocks?: boolean; onStationClick?: (code: string) => void;
}) {
  const { activeBlocks, cameraTarget, corridors, highPerformanceVfx, colorMode } = useSimulation();
  const reduced = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [size, setSize] = useState({ width: 900, height: 650 });
  const [view, setView] = useState<MapViewState>(INITIAL);
  const [mapError, setMapError] = useState(false);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const coral: [number, number, number, number] = colorMode === 'standard' ? CORAL : [186, 160, 255, 255];
  const transition = reduced || !highPerformanceVfx ? 0 : 1100;

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback((points: Coordinate[], pitch = 42) => {
    if (!boundsForCoordinates(points) || size.width < 10 || size.height < 10) return;
    const fitted = fitCinematicBounds(points, size.width, size.height, {
      top: Math.min(150, size.height * .23), bottom: Math.min(110, size.height * .20),
      left: Math.min(125, size.width * .16),
      right: detailPanelOpen && size.width > 700 ? Math.min(415, size.width * .38) : Math.min(120, size.width * .16)
    }, pitch, pitch ? -12 : 0);
    if (fitted) setView({...fitted, transitionDuration: transition, transitionInterpolator: new FlyToInterpolator()});
  }, [size, transition, detailPanelOpen]);

  const networkPoints = useMemo(() => corridors.flatMap(c => c.stations.map(s => [s.lon, s.lat] as Coordinate)), [corridors]);
  useEffect(() => {
    if (networkPoints.length && !initialized.current) { fit(networkPoints); initialized.current = true; }
  }, [networkPoints, fit]);

  useEffect(() => {
    if (!cameraTarget) return;
    if (cameraTarget.bounds) { fit(cameraTarget.bounds, cameraTarget.pitch ?? 35); return; }
    setView(previous => ({ ...previous, longitude: cameraTarget.lon, latitude: cameraTarget.lat,
      zoom: cameraTarget.zoom ?? 8, pitch: cameraTarget.pitch ?? 25, bearing: cameraTarget.bearing ?? 0,
      transitionDuration: transition, transitionInterpolator: new FlyToInterpolator() }));
  }, [cameraTarget, fit, transition]);

  const routes = useMemo(() => corridors.map(c => ({ ...c,
    route: c.path?.length ? c.path : c.stations.map(s => [s.lon, s.lat] as Coordinate) })), [corridors]);
  const stations = useMemo(() => [...new globalThis.Map(corridors.flatMap(c => c.stations).map(s => [s.code, s])).values()]
    .map(s => ({ ...s, position: [s.lon, s.lat] as Coordinate, hub: HUBS[s.code] })), [corridors]);
  const viewport = useMemo(() => new WebMercatorViewport({ ...size, ...view }), [size, view]);
  const clusters = useMemo(() => clusterTrains(trains, point => viewport.project(point),         view.zoom < 7 ? 29 : 20, selectedTrainId), [trains, viewport, view.zoom, selectedTrainId]);
  const singles = clusters.filter(c => c.trains.length === 1);
  const grouped = clusters.filter(c => c.trains.length > 1);
  const selected = trains.find(t => t.train_number === selectedTrainId);
  const blocks = useMemo(() => activeBlocks.map(block => ({ block, path: getBlockPath(block, corridors) })).filter(b => b.path.length > 1), [activeBlocks, corridors]);
  const blockBeacons = blocks.flatMap(b => b.path.filter((_, index) => index % Math.max(1, Math.floor(b.path.length / 24)) === 0).map(position => ({...b, position})));
  const blockEnds = blocks.flatMap(b => [b.path[0], b.path[b.path.length - 1]].map(position => ({ ...b, position })));
  const pickTrain = (cluster: TrainCluster) => {
    if (cluster.trains.length > 1) {
      // Collocated trains cannot be separated by zoom; always expose one in the searchable list.
      onTrainClick?.(cluster.trains[0]);
      fit(cluster.trains.map(t => [t.lon, t.lat]));
    } else onTrainClick?.(cluster.trains[0]);
  };
  const layers = [
    new PathLayer({ id: 'rail-shadow', data: routes, getPath: d => d.route, getColor: [1, 7, 15, 240], getWidth: 9, widthUnits: 'pixels', capRounded: true, jointRounded: true }),
    new PathLayer({ id: 'golden-glow', data: routes, getPath: d => d.route,       getColor: [242, 192, 91, 45],
      getWidth: highPerformanceVfx ? 18 : 7, widthUnits: 'pixels', capRounded: true, jointRounded: true }),
    new PathLayer({ id: 'golden-quadrilateral', data: routes, getPath: d => d.route,
      getColor: d => !focusCorridor || focusCorridor === 'ALL' || d.leg_id === focusCorridor ? GOLD : [123, 111, 87, 100],
      getWidth: d => d.leg_id === focusCorridor ? 4.5 : 3, widthUnits: 'pixels', capRounded: true, jointRounded: true,
      updateTriggers: { getColor: focusCorridor, getWidth: focusCorridor } }),
    new ScatterplotLayer({ id: 'stations', data: stations.filter(s => s.hub || (showStations && view.zoom >= 6)), getPosition: d => d.position,
      getRadius: d => d.hub ? 5 : 3, radiusUnits: 'pixels', stroked: true, getFillColor: [14, 23, 35, 255], getLineColor: GOLD,
      lineWidthMinPixels: 1.5, pickable: true, onClick: info => { if (info.object) onStationClick?.(info.object.code); } }),
    new TextLayer({ id: 'hub-labels', data: stations.filter(s => s.hub), getPosition: d => d.position, getText: d => d.hub,
      getPixelOffset: [12, -13], getTextAnchor: 'start',       getSize: 13, fontFamily: 'Inter, Segoe UI, sans-serif', fontWeight: 600,
      getColor: [242, 219, 175, 255], outlineWidth: 4, outlineColor: [9, 16, 27, 255], fontSettings: { sdf: true } }),
    new PathLayer({ id: 'block-outline', data: blocks, visible: showBlocks, getPath: d => d.path, getWidth: 13, widthUnits: 'pixels', getColor: [9, 16, 27, 255], capRounded: true }),
        new PathLayer({
      id: "implemented-block-glow",
      data: blocks,
      visible: showBlocks && highPerformanceVfx,
      getPath: (d) => d.path,
      getWidth: 25,
      widthUnits: "pixels",
      getColor: [...coral.slice(0, 3), 48] as [number, number, number, number],
      capRounded: true,
      jointRounded: true,
    }),
    new PathLayer({
      id: "implemented-blocks", data: blocks, visible: showBlocks, getPath: d => d.path,
      getColor: coral, getWidth: d => d.block.id === selectedBlockId ? 9 : 6, widthUnits: 'pixels', capRounded: true, jointRounded: true,
      pickable: true, onClick: info => { if (info.object) onBlockClick?.(info.object.block); }, updateTriggers: { getWidth: selectedBlockId } }),
    new ColumnLayer({ id: 'block-beacons',       data: highPerformanceVfx ? blockBeacons : blockEnds, visible: showBlocks && view.pitch > 10,
      getPosition: d => d.position,       getElevation: 5500,
      radius: 350, diskResolution: 8, extruded: true, getFillColor: [...coral.slice(0, 3), 160] as [number, number, number, number], pickable: true,
      onClick: info => { if (info.object) onBlockClick?.(info.object.block); } }),
    new PathLayer({ id: 'raised-block-boundary', data: blocks, visible: showBlocks && view.pitch > 10, getPath: d => d.path.map((p: Coordinate) => [p[0], p[1], 5500]), getColor: coral, getWidth: 2, widthUnits: 'pixels', pickable: true, onClick: info => { if(info.object) onBlockClick?.(info.object.block); } }),
    new ScatterplotLayer({ id: 'block-boundaries', data: blockEnds, visible: showBlocks, getPosition: d => d.position,
      getFillColor: [11, 19, 30, 255], getLineColor: coral, stroked: true, lineWidthMinPixels: 2.5, getRadius: 6, radiusUnits: 'pixels' }),
    new ScatterplotLayer({       id: "train-hit-targets",
      billboard: true,
      parameters: { depthWriteEnabled: false, depthCompare: "always" }, data: clusters, visible: showTrains, getPosition: d => d.position,
      getRadius: d => d.trains.length > 1 ? 15 : 16, radiusUnits: 'pixels', getFillColor: [7, 25, 38, 240],
      stroked: true, getLineColor: [113, 219, 246, 110], lineWidthMinPixels: 1.2, pickable: true,
      onClick: info => { if (info.object) pickTrain(info.object); },
      onHover: info => setHover(info.object ? { x: info.x, y: info.y,
        text: info.object.trains.length > 1 ? `${info.object.trains.length} trains · click to explore` : `#${info.object.trains[0].train_number} · ${info.object.trains[0].train_name}` } : null) }),
    new IconLayer({       id: "train-cabs",
      parameters: { depthWriteEnabled: false, depthCompare: "always" }, data: singles, visible: showTrains, iconAtlas: TRAIN_ICON,
      iconMapping: { train: { x: 0, y: 0, width: 64, height: 64, mask: false } }, getIcon: () => 'train',
      getPosition: d => d.position, getColor: CYAN, getSize: 31, sizeUnits: 'pixels',
      getAngle: d => -(d.trains[0].bearing ?? d.trains[0].heading ?? 0), billboard: true,
      transitions: reduced || !highPerformanceVfx ? {} : { getPosition: 900, getAngle: 500 }, pickable: false }),
    new TextLayer({       id: "cluster-counts",
      parameters: { depthWriteEnabled: false, depthCompare: "always" }, data: grouped, visible: showTrains, getPosition: d => d.position,
      getText: d => String(d.trains.length), getColor: CYAN, getSize: 12, fontWeight: 700, fontFamily: 'Inter, Segoe UI, sans-serif', pickable: false }),
    new ScatterplotLayer({       id: "selected-train-ring",
      billboard: true,
      parameters: { depthWriteEnabled: false, depthCompare: "always" }, data: selected ? [selected] : [], visible: showTrains,
      getPosition: d => [d.lon, d.lat], getRadius: 23, radiusUnits: 'pixels', filled: false, stroked: true, getLineColor: [240, 248, 255, 240], lineWidthMinPixels: 2 }),
        new TextLayer({
      id: "train-numbers",
      parameters: { depthWriteEnabled: false, depthCompare: "always" }, data: singles.filter(c => c.trains[0].train_number === selectedTrainId || view.zoom >= 9), visible: showTrains,
      getPosition: d => d.position, getText: d => `#${d.trains[0].train_number}`, getPixelOffset: [23, 0], getTextAnchor: 'start',
      getColor: [234, 247, 255, 255], getSize: 12, fontFamily: 'Inter, Segoe UI, sans-serif', background: true,
      getBackgroundColor: [11, 24, 38, 235], backgroundPadding: [5, 3],       fontWeight: 600,
    }),
    new TextLayer({
      id: "implemented-block-labels",
      data: blocks,
      visible: showBlocks,
      parameters: { depthWriteEnabled: false, depthCompare: "always" },
      getPosition: (d) => d.path[Math.floor(d.path.length / 2)],
      getText: (d) => `BLOCK  ${d.block.request.from_station} → ${d.block.request.to_station}`,
      getPixelOffset: [0, -30],
      getSize: 11,
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontWeight: 650,
      getColor: coral,
      background: true,
      getBackgroundColor: [37, 19, 18, 240],
      backgroundPadding: [9, 6],
      pickable: true,
      onClick: (info) => {
        if (info.object) onBlockClick?.(info.object.block);
      },
    }),
  ];

  return <div ref={container} className="network-canvas" aria-label="Interactive Golden Quadrilateral railway map">
    <DeckGL viewState={{ ...view, minZoom: 3, maxZoom: 16 }} controller={{ dragRotate: true, keyboard: true }}
      onViewStateChange={({ viewState }) => setView(viewState as MapViewState)} layers={layers} getCursor={({ isHovering, isDragging }) => isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'}>
      <Map           mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" reuseMaps onError={() => setMapError(true)} onLoad={() => setMapError(false)} />
    </DeckGL>
    <div className="map-grain" aria-hidden="true" />
    {mapError && <div className="map-notice" role="status">Basemap unavailable. Backend network overlays remain visible.</div>}
    {hover && <div className="map-tooltip" style={{ left: Math.min(hover.x + 18, Math.max(12, size.width - 260)), top: Math.min(hover.y + 20, size.height - 60) }}>{hover.text}</div>}
    <div className="map-tools" aria-label="Map controls">
      <button title="Zoom in" aria-label="Zoom in" onClick={() => setView(v => ({ ...v, zoom: Math.min(v.zoom + .7, 16), transitionDuration: transition }))}><Plus size={17} /></button>
      <button title="Zoom out" aria-label="Zoom out" onClick={() => setView(v => ({ ...v, zoom: Math.max(v.zoom - .7, 3), transitionDuration: transition }))}><Minus size={17} /></button>
      <span />
      <button title="Fit entire network" aria-label="Fit entire network" onClick={() => fit(networkPoints)}><Focus size={18} /></button>
      <button title="Toggle 3D perspective" aria-label="Toggle 3D perspective" aria-pressed={view.pitch > 10} onClick={() => setView(v => ({ ...v,               pitch: v.pitch > 10 ? 0 : 42,
              bearing: v.pitch > 10 ? 0 : -12, transitionDuration: transition }))}><Layers3 size={17} /></button>
    </div>
    <div className="map-scale-note">{view.pitch > 10 ? '3D PERSPECTIVE' : 'NETWORK ATLAS'}<span>Scroll to explore · click a train to inspect</span></div>
  </div>;
}
