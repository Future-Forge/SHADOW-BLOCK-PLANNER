import { useEffect, useMemo, useState, useRef } from 'react';
import Map from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { PathLayer, ScatterplotLayer, LineLayer, ColumnLayer } from '@deck.gl/layers';
import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ActiveBlock, Corridor, LiveTrainState } from '../api/types';
import { useSimulation } from '../store/SimulationContext';
import { getMapColor, type ColorBlindnessMode } from '../lib/accessibility';
import { Navigation } from 'lucide-react';

// Tactical Rail Engine Palette (Military-grade infrastructure tokens)
const CORRIDOR_COLORS = {
  WEST: [52, 211, 153],       // status-nominal (#34D399)
  SOUTH_WEST: [56, 189, 248], // train-modern (#38BDF8)
  EAST_COAST: [167, 243, 208],// accent-maintenance (#A7F3D0)
  NORTH_EAST: [252, 211, 77], // train-premium (#FCD34D)
} as const;

const TRAIN_COLORS = {
  PREMIUM: [252, 211, 77],    // train-premium (#FCD34D) - Rajdhani / Shatabdi
  SUPERFAST: [56, 189, 248],  // train-modern (#38BDF8) - Modern / Vande Bharat
  DELAYED: [249, 115, 22],    // train-delayed (#F97316) - Delayed / Held
  EXPRESS: [52, 211, 153],    // status-nominal (#34D399) - On-time mainlines
  PASSENGER: [226, 234, 244], // text-tactical-steel (#E2EAF4)
  FREIGHT: [148, 163, 184],   // Desaturated tactical steel
} as const;

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  minZoom?: number;
  maxZoom?: number;
  transitionDuration?: number;
  transitionInterpolator?: any;
}

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: 79.0,
  latitude: 22.0,
  zoom: 4.2,
  pitch: 55,
  bearing: -12,
  minZoom: 3,
  maxZoom: 16,
};

function findCorridorForBlock(corridors: Corridor[], block: ActiveBlock) {
  return corridors.find(
    (corridor) =>
      corridor.stations.some((station) => station.code === block.request.from_station) &&
      corridor.stations.some((station) => station.code === block.request.to_station),
  );
}

function getAction(train: LiveTrainState, blocks: ActiveBlock[]) {
  for (const block of blocks) {
    const affected = block.decision.affected_trains.find((item) => item.train_number === train.train_number);
    if (affected) return affected.action;
  }
  return 'NONE' as const;
}

function getTrackPath(corridor: Corridor) {
  return corridor.stations.map((station) => [station.lon, station.lat] as [number, number]);
}

function buildTrail(train: LiveTrainState) {
  const tail: [number, number][] = [];
  const drift = 0.02 + (train.speed_kmph / 2500);

  for (let i = 0; i < 6; i += 1) {
    const offset = drift * (i + 1);
    const direction = train.track_line === 'UP' ? -1 : 1;
    tail.push([train.lon + offset * direction * 0.8, train.lat - offset * (i % 2 === 0 ? 0.6 : 0.9)]);
  }

  return tail;
}

// Generates 3D extruded tactical pillars along the active block segment with accessibility color mapping
function create3DBlockPillars(block: ActiveBlock, corridors: Corridor[], colorMode: ColorBlindnessMode = 'standard') {
  const baseColor = getMapColor(block.request.criticality, colorMode);
  const pillars: Array<{
    blockId: string;
    position: [number, number];
    elevation: number;
    color: [number, number, number, number];
    criticality: string;
  }> = [];

  // Determine path points: prefer geo-accurate LineString block_geometry from backend
  let pathPoints: [number, number][] = [];
  if (block.decision.block_geometry && block.decision.block_geometry.length >= 2) {
    pathPoints = block.decision.block_geometry as [number, number][];
  } else {
    const corridor = findCorridorForBlock(corridors, block);
    if (corridor) {
      const fromIdx = corridor.stations.findIndex((s) => s.code === block.request.from_station);
      const toIdx = corridor.stations.findIndex((s) => s.code === block.request.to_station);
      if (fromIdx !== -1 && toIdx !== -1) {
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        const slice = corridor.stations.slice(lo, hi + 1);
        pathPoints = (fromIdx <= toIdx ? slice : [...slice].reverse()).map((s) => [s.lon, s.lat] as [number, number]);
      }
    }
  }

  if (pathPoints.length < 2) {
    const corridor = findCorridorForBlock(corridors, block);
    const stationFrom = corridor?.stations.find((s) => s.code === block.request.from_station);
    const stationTo = corridor?.stations.find((s) => s.code === block.request.to_station);
    if (stationFrom && stationTo) {
      pathPoints = [
        [stationFrom.lon, stationFrom.lat],
        [stationTo.lon, stationTo.lat],
      ];
    } else {
      return [];
    }
  }

  // Smoothly sample along physical polyline
  const steps = Math.max(18, pathPoints.length * 2);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const exactIdx = t * (pathPoints.length - 1);
    const lowIdx = Math.floor(exactIdx);
    const highIdx = Math.min(lowIdx + 1, pathPoints.length - 1);
    const subFrac = exactIdx - lowIdx;

    const pLow = pathPoints[lowIdx];
    const pHigh = pathPoints[highIdx];
    const x = pLow[0] + (pHigh[0] - pLow[0]) * subFrac;
    const y = pLow[1] + (pHigh[1] - pLow[1]) * subFrac;

    // Arching 3D elevation from 2,500m to 6,500m
    const elevation = 2500 + Math.sin(t * Math.PI) * 4000;

    pillars.push({
      blockId: block.id,
      position: [x, y],
      elevation,
      color: [...baseColor, 210],
      criticality: block.request.criticality,
    });
  }

  return pillars;
}

// Generates highlighted 3D block route line with accessibility color mapping
function createBlockLines(blocks: ActiveBlock[], corridors: Corridor[], colorMode: ColorBlindnessMode = 'standard') {
  const lines: Array<{ path: [number, number][]; color: [number, number, number, number] }> = [];

  blocks.forEach((block) => {
    const baseColor = getMapColor(block.request.criticality, colorMode);

    // If geo-accurate block_geometry is present from backend, use it directly!
    if (block.decision.block_geometry && block.decision.block_geometry.length >= 2) {
      lines.push({
        path: block.decision.block_geometry as [number, number][],
        color: [...baseColor, 250],
      });
      return;
    }

    // Fallback: slice stations from corridor or connect endpoints
    const corridor = findCorridorForBlock(corridors, block);
    if (!corridor) return;

    const fromIdx = corridor.stations.findIndex((s) => s.code === block.request.from_station);
    const toIdx = corridor.stations.findIndex((s) => s.code === block.request.to_station);
    if (fromIdx !== -1 && toIdx !== -1) {
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      const slice = corridor.stations.slice(lo, hi + 1);
      const subpath = (fromIdx <= toIdx ? slice : [...slice].reverse()).map((s) => [s.lon, s.lat] as [number, number]);
      lines.push({
        path: subpath,
        color: [...baseColor, 250],
      });
      return;
    }

    const fromStation = corridor.stations.find((s) => s.code === block.request.from_station);
    const toStation = corridor.stations.find((s) => s.code === block.request.to_station);
    if (!fromStation || !toStation) return;

    lines.push({
      path: [
        [fromStation.lon, fromStation.lat],
        [toStation.lon, toStation.lat],
      ],
      color: [...baseColor, 250],
    });
  });

  return lines;
}

export const NetworkMap = ({
  trains,
  onBlockClick,
}: {
  trains: LiveTrainState[];
  onBlockClick?: (block: ActiveBlock) => void;
}) => {
  const { activeBlocks, setPrefillStation, cameraTarget, corridors, colorMode, highPerformanceVfx } = useSimulation();
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [hoverInfo, setHoverInfo] = useState<{ object: any; x: number; y: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Live 3D "Stand Up" elevationScale animation state (0 -> 1 over 1500ms)
  const [animatedElevationScale, setAnimatedElevationScale] = useState(1);
  const prevBlockCountRef = useRef(activeBlocks.length);

  useEffect(() => {
    // When a block is added (or updated), trigger the 1500ms physical rise transition
    if (activeBlocks.length > 0 && activeBlocks.length !== prevBlockCountRef.current) {
      setAnimatedElevationScale(0);
      const startTime = performance.now();
      const duration = 1500;

      let rafId: number;
      const animateStep = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Cubic ease-out: 1 - (1 - t)^3
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimatedElevationScale(eased);

        if (progress < 1) {
          rafId = requestAnimationFrame(animateStep);
        }
      };

      rafId = requestAnimationFrame(animateStep);
      return () => cancelAnimationFrame(rafId);
    }
    prevBlockCountRef.current = activeBlocks.length;
  }, [activeBlocks.length]);

  // React smoothly to camera navigation targets (e.g. from combobox or cinematic FlyTo)
  useEffect(() => {
    if (!cameraTarget) return;

    const container = mapContainerRef.current;
    if (cameraTarget.bounds && container) {
      const { width, height } = container.getBoundingClientRect();
      const fitted = new WebMercatorViewport({ width, height, ...viewState }).fitBounds(cameraTarget.bounds, {
        padding: { top: 150, bottom: 150, left: 500, right: 400 },
        maxZoom: 14,
      });
      setViewState((prev) => ({
        ...prev,
        ...fitted,
        pitch: cameraTarget.pitch ?? 60,
        bearing: cameraTarget.bearing ?? -15,
        transitionDuration: cameraTarget.transitionDuration ?? 2000,
        transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }),
      }));
      return;
    }

    setViewState((prev) => ({
      ...prev,
      longitude: cameraTarget.lon,
      latitude: cameraTarget.lat,
      zoom: cameraTarget.zoom ?? 11,
      pitch: cameraTarget.pitch ?? 60,
      bearing: cameraTarget.bearing ?? -12,
      transitionDuration: cameraTarget.transitionDuration ?? 2000,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }),
    }));
  }, [cameraTarget]);

  const corridorLayers = useMemo(
    () =>
      corridors.map((corridor) => ({
        path: getTrackPath(corridor),
        color:
          corridor.leg_id === 'WEST'
            ? getMapColor('nominal', colorMode)
            : CORRIDOR_COLORS[corridor.leg_id] || [52, 211, 153],
        name: corridor.display_name,
      })),
    [corridors, colorMode],
  );

  const stationData = useMemo(() => {
    const seen = new Set<string>();
    const stations: Array<{ position: [number, number]; code: string; name: string }> = [];
    corridors.forEach((c) =>
      c.stations.forEach((s) => {
        if (!seen.has(s.code)) {
          seen.add(s.code);
          stations.push({ position: [s.lon, s.lat], code: s.code, name: s.name });
        }
      }),
    );
    return stations;
  }, [corridors]);

  const trainData = useMemo(
    () =>
      trains
        .filter((train) => train.corridor_leg)
        .sort((a, b) => a.train_number.localeCompare(b.train_number))
        .map((train) => {
          const action = getAction(train, activeBlocks);
          let color: [number, number, number];

          // Semantic Colors from Tactical Palette
          const isDelayedOrHeld =
            action === 'HOLD' ||
            train.status === 'HELD' ||
            action === 'DIVERT' ||
            action === 'LOOP' ||
            train.status === 'LOOPED' ||
            (train.delay_minutes && train.delay_minutes > 0);

          if (isDelayedOrHeld) {
            color = [...TRAIN_COLORS.DELAYED]; // Delayed/Held: Orange (#F97316)
          } else if (train.category === 'PREMIUM') {
            color = [...TRAIN_COLORS.PREMIUM]; // Premium/Rajdhani: Gold (#FCD34D)
          } else if (train.category === 'SUPERFAST') {
            color = [...TRAIN_COLORS.SUPERFAST]; // Modern/Vande Bharat: Cyan (#38BDF8)
          } else if (train.category === 'EXPRESS') {
            color = [...TRAIN_COLORS.EXPRESS]; // Express: Emerald (#34D399)
          } else if (train.category === 'FREIGHT') {
            color = [...TRAIN_COLORS.FREIGHT]; // Freight: Tactical steel
          } else {
            color = [...TRAIN_COLORS.PASSENGER]; // Passenger/Default: Slate steel
          }

          // If accessibility color mode is active, allow high-contrast override
          if (colorMode !== 'standard') {
            if (isDelayedOrHeld) {
              color = getMapColor('critical', colorMode);
            } else if (train.category === 'EXPRESS') {
              color = getMapColor('nominal', colorMode);
            }
          }

          return {
            id: train.train_number,
            name: train.train_name,
            position: [train.lon, train.lat] as [number, number],
            color,
            radius: isDelayedOrHeld ? 10 : action !== 'NONE' ? 10 : 7,
            speed: Math.round(train.speed_kmph),
            status: train.status,
            action,
            trail: buildTrail(train),
            category: train.category,
          };
        }),
    [trains, activeBlocks, colorMode],
  );

  const detourPaths = useMemo(() => {
    const paths: Array<{ path: [number, number][]; color: [number, number, number, number] }> = [];

    activeBlocks.forEach((block) => {
      const corridor = findCorridorForBlock(corridors, block);
      if (!corridor) return;

      const fromStation = corridor.stations.find((s) => s.code === block.request.from_station);
      const toStation = corridor.stations.find((s) => s.code === block.request.to_station);
      if (!fromStation || !toStation) return;

      const affectedTrains = trains.filter((train) => getAction(train, [block]) === 'DIVERT');
      const cautionColor = getMapColor('caution', colorMode);
      affectedTrains.forEach((train) => {
        paths.push({
          path: [
            [train.lon, train.lat],
            [(fromStation.lon + toStation.lon) / 2 + 0.4, (fromStation.lat + toStation.lat) / 2 + 0.6],
            [toStation.lon, toStation.lat],
          ],
          color: [...cautionColor, 200],
        });
      });
    });

    return paths;
  }, [activeBlocks, corridors, trains, colorMode]);

  // 3D block extruded pillars
  const blockPillars = useMemo(
    () => activeBlocks.flatMap((block) => create3DBlockPillars(block, corridors, colorMode)),
    [activeBlocks, corridors, colorMode],
  );

  // Active block segment lines
  const blockHighlightLines = useMemo(
    () => createBlockLines(activeBlocks, corridors, colorMode),
    [activeBlocks, corridors, colorMode],
  );

  const layers = [
    // 1. Golden Quadrilateral Trunk Rail Lines (Razor-crisp tactical network)
    new PathLayer({
      id: 'gq-tracks',
      data: corridorLayers,
      getPath: (d: any) => d.path,
      getColor: (d: any) => [...d.color, 90],
      widthMinPixels: 2.2,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      opacity: 0.95,
    }),

    // 2. Glowing Block Segment Highlight Lines (Tactical status indicators)
    new PathLayer({
      id: 'active-block-segment',
      data: blockHighlightLines,
      getPath: (d: any) => d.path,
      getColor: (d: any) => d.color,
      widthMinPixels: 5.5,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      opacity: 0.95,
    }),

    // 3. 3D Extruded Hexagonal Tactical Pillars (Cinematic "Stand Up" Live Extrusion)
    new ColumnLayer({
      id: 'block-3d-pillars',
      data: blockPillars,
      diskResolution: highPerformanceVfx ? 12 : 6,
      radius: 500, // 500m radius column for crisp tactical perspective
      radiusMinPixels: 4,
      radiusMaxPixels: 26,
      extruded: true,
      pickable: true,
      elevationScale: animatedElevationScale,
      material: highPerformanceVfx
        ? {
            ambient: 0.35,
            diffuse: 0.8,
            shininess: 40,
            specularColor: [255, 255, 255],
          }
        : undefined,
      transitions: {
        elevationScale: {
          duration: 1500,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
        },
      },
      getPosition: (d: any) => d.position,
      getElevation: (d: any) => d.elevation,
      getFillColor: (d: any) => d.color,
      getLineColor: (d: any) => [d.color[0], d.color[1], d.color[2], 255],
      onClick: (info: any) => {
        const block = activeBlocks.find((candidate) => candidate.id === info.object?.blockId);
        if (block) onBlockClick?.(block);
      },
      lineWidthMinPixels: 1.5,
      wireframe: true,
    }),

    // 4. Detour / Regulation Paths (Alert Orange status-caution)
    new LineLayer({
      id: 'detour-routes',
      data: detourPaths,
      getSourcePosition: (d: any) => d.path[0],
      getTargetPosition: (d: any) => d.path[1],
      getColor: (d: any) => d.color,
      getWidth: 2.5,
      widthUnits: 'pixels',
      opacity: 0.9,
    }),

    // 5. Train Speed Trails (High-contrast operational trails)
    new PathLayer({
      id: 'train-trails',
      data: trainData.map((train) => ({ path: train.trail, color: [...train.color, 75] })),
      getPath: (d: any) => d.path,
      getColor: (d: any) => d.color,
      widthMinPixels: 2.8,
      widthUnits: 'pixels',
      opacity: 0.85,
      capRounded: true,
      jointRounded: true,
    }),

    // 6. Live Train Markers (Tactical Command-Center Assets)
    new ScatterplotLayer({
      id: 'train-nodes',
      data: trainData,
      getPosition: (d: any) => d.position,
      getFillColor: (d: any) => d.color,
      getLineColor: [255, 255, 255, 200], // Subtle white halo
      getRadius: (d: any) => d.radius,
      radiusUnits: 'pixels',
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      lineWidthMinPixels: 2,
      opacity: 1,
      stroked: true,
      filled: true,
      pickable: true,
      transitions: {
        getPosition: 1000,
      },
      onHover: (info: any) => {
        if (info.object) {
          setHoverInfo({ object: info.object, x: info.x, y: info.y });
        } else {
          setHoverInfo(null);
        }
      },
    }),

    // 7. Tactical Station Nodes
    new ScatterplotLayer({
      id: 'station-nodes',
      data: stationData,
      getPosition: (d: any) => d.position,
      getFillColor: [26, 36, 33, 200], // bg-tactical-panel
      getLineColor: [44, 58, 53, 255], // border-tactical-grid
      getRadius: 4.5,
      radiusUnits: 'pixels',
      lineWidthMinPixels: 1.5,
      stroked: true,
      pickable: true,
      onClick: (info: any) => {
        if (info.object) {
          setPrefillStation(info.object.code);
        }
      },
    }),
  ];

  return (
    <div ref={mapContainerRef} className="h-full w-full relative bg-[#0D1311]">
      <DeckGL
        viewState={viewState}
        controller={{
          dragRotate: true,
          touchRotate: true,
          keyboard: true,
        }}
        onViewStateChange={({ viewState: newViewState }: any) =>
          setViewState(newViewState as typeof viewState)
        }
        layers={layers}
      >
        <Map
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          reuseMaps
          style={{
            width: '100%',
            height: '100%',
            // Keep the dark basemap readable beneath the tactical overlays.
            filter: 'brightness(0.98) contrast(1.08) saturate(0.9)',
          }}
        />
      </DeckGL>

      {/* Train / Object Tooltip - Tactical Rail Engine Specification */}
      {hoverInfo && hoverInfo.object && (
        <div
          className="pointer-events-none absolute z-50 rounded-xl border border-[#2C3A35] bg-[#1A2421]/95 p-3 font-mono text-xs text-[#E2EAF4] shadow-[0_8px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          style={{ left: hoverInfo.x, top: hoverInfo.y + 15 }}
        >
          <div className="mb-1 flex items-center justify-between gap-4 font-bold">
            <span style={{ color: `rgb(${hoverInfo.object.color.slice(0, 3).join(',')})` }}>
              TRK-ID #{hoverInfo.object.id}
            </span>
            <span className="text-[10px] text-[#E2EAF4]/60 uppercase tracking-wider">{hoverInfo.object.category}</span>
          </div>
          {hoverInfo.object.name && (
            <div className="text-[11px] text-[#E2EAF4]/85 mb-1 font-sans">{hoverInfo.object.name}</div>
          )}
          <div className="text-[#E2EAF4]/60">
            Velocity: <span className="text-[#E2EAF4] font-semibold">{hoverInfo.object.speed} km/h</span>
          </div>
          <div className="text-[#E2EAF4]/60">
            Telemetry:{' '}
            <span
              className={
                hoverInfo.object.status === 'RUNNING'
                  ? 'text-[#34D399] font-semibold'
                  : 'text-[#F97316] font-semibold'
              }
            >
              {hoverInfo.object.status}
            </span>
          </div>
          {hoverInfo.object.action && hoverInfo.object.action !== 'NONE' && (
            <div className="mt-1 pt-1 border-t border-[#2C3A35] text-[#EF4444] font-bold">
              DIRECTIVE: {hoverInfo.object.action}
            </div>
          )}
        </div>
      )}

      {/* Reset Camera View Button - Tactical Specification */}
      <button
        className="absolute bottom-6 right-6 z-10 rounded-full border border-[#2C3A35] bg-[#1A2421]/80 p-2.5 text-[#E2EAF4]/70 shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md transition hover:border-[#A7F3D0] hover:bg-[#1A2421] hover:text-[#A7F3D0] hover:shadow-[0_0_12px_rgba(167,243,208,0.3)]"
        onClick={() => {
          setViewState({
            ...INITIAL_VIEW_STATE,
            transitionDuration: 1500,
            transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }),
          });
        }}
        title="Reset Tactical Camera"
      >
        <Navigation className="h-5 w-5" />
      </button>
    </div>
  );
};
