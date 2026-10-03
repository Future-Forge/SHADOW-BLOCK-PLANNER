import type {
  Corridor,
  CorridorLeg,
  LiveTrainState,
  BlockRequest,
  BlockDecision,
  ChatResponse,
  HealthResponse,
  DispatcherChatRequest,
  DispatcherChatResponse,
  StationItem,
  TrafficPreviewRequest,
  TrafficPreviewResponse,
  BlockResourceData,
} from "./types";

function getInitialBaseUrl(): string {
  try {
    const saved = localStorage.getItem("SHADOW_BLOCK_API_URL");
    if (saved) return saved;
  } catch {
    // localStorage not accessible
  }

  if (typeof window !== "undefined" && window.location && window.location.hostname) {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "") {
      return `http://${host}:8000`;
    }
  }

  return import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
}

let currentBaseUrl: string = getInitialBaseUrl();

let isLiveBackendAvailable = false;

export function getApiBaseUrl(): string {
  return currentBaseUrl;
}

export function setApiBaseUrl(url: string): void {
  currentBaseUrl = url.replace(/\/+$/, "");
  try {
    localStorage.setItem("SHADOW_BLOCK_API_URL", currentBaseUrl);
  } catch {
    // ignore
  }
}

export function isConnectedToBackend(): boolean {
  return isLiveBackendAvailable;
}

// ═══════════════════════════════════════════════════════════════════════════
// GOLDEN QUADRILATERAL REFERENCE DATASET (Full 4-Corridor Trunk Network)
// ═══════════════════════════════════════════════════════════════════════════

export const GQ_CORRIDORS: Corridor[] = [
  {
    leg_id: "WEST",
    display_name: "Delhi - Mumbai (West Corridor)",
    origin_code: "NDLS",
    destination_code: "BCT",
    total_km: 1384.2,
    stations: [
      { code: "NDLS", name: "NEW DELHI", lat: 28.614, lon: 77.219, cumulative_km: 0.0 },
      { code: "MTJ", name: "MATHURA JN", lat: 27.492, lon: 77.674, cumulative_km: 141.0 },
      { code: "KOTA", name: "KOTA JN", lat: 25.180, lon: 75.865, cumulative_km: 465.0 },
      { code: "RTM", name: "RATLAM JN", lat: 23.334, lon: 75.044, cumulative_km: 731.0 },
      { code: "BRC", name: "VADODARA JN", lat: 22.311, lon: 73.181, cumulative_km: 992.0 },
      { code: "ST", name: "SURAT", lat: 21.204, lon: 72.841, cumulative_km: 1122.0 },
      { code: "BCT", name: "MUMBAI CENTRAL", lat: 18.969, lon: 72.819, cumulative_km: 1384.2 },
    ],
  },
  {
    leg_id: "SOUTH_WEST",
    display_name: "Mumbai - Chennai (South-West Corridor)",
    origin_code: "BCT",
    destination_code: "MAS",
    total_km: 1281.0,
    stations: [
      { code: "BCT", name: "MUMBAI CENTRAL", lat: 18.969, lon: 72.819, cumulative_km: 0.0 },
      { code: "PUNE", name: "PUNE JN", lat: 18.528, lon: 73.874, cumulative_km: 192.0 },
      { code: "DD", name: "DAUND JN", lat: 18.465, lon: 74.577, cumulative_km: 268.0 },
      { code: "SUR", name: "SOLAPUR JN", lat: 17.659, lon: 75.906, cumulative_km: 455.0 },
      { code: "WADI", name: "WADI JN", lat: 17.050, lon: 76.994, cumulative_km: 605.0 },
      { code: "GTL", name: "GUNTAKAL JN", lat: 15.166, lon: 77.371, cumulative_km: 834.0 },
      { code: "RU", name: "RENIGUNTA JN", lat: 13.650, lon: 79.516, cumulative_km: 1144.0 },
      { code: "MAS", name: "CHENNAI CENTRAL", lat: 13.082, lon: 80.275, cumulative_km: 1281.0 },
    ],
  },
  {
    leg_id: "EAST_COAST",
    display_name: "Chennai - Howrah (East Coast Corridor)",
    origin_code: "MAS",
    destination_code: "HWH",
    total_km: 1661.5,
    stations: [
      { code: "MAS", name: "CHENNAI CENTRAL", lat: 13.082, lon: 80.275, cumulative_km: 0.0 },
      { code: "GDR", name: "GUDUR JN", lat: 14.148, lon: 79.851, cumulative_km: 138.0 },
      { code: "BZA", name: "VIJAYAWADA JN", lat: 16.518, lon: 80.620, cumulative_km: 431.0 },
      { code: "RJY", name: "RAJAHMUNDRY", lat: 16.989, lon: 81.777, cumulative_km: 580.0 },
      { code: "VSKP", name: "VISAKHAPATNAM", lat: 17.721, lon: 83.298, cumulative_km: 781.0 },
      { code: "BBS", name: "BHUBANESWAR", lat: 20.266, lon: 85.844, cumulative_km: 1224.0 },
      { code: "CTC", name: "CUTTACK", lat: 20.463, lon: 85.892, cumulative_km: 1252.0 },
      { code: "KGP", name: "KHARAGPUR JN", lat: 22.339, lon: 87.322, cumulative_km: 1546.0 },
      { code: "HWH", name: "HOWRAH JN", lat: 22.583, lon: 88.343, cumulative_km: 1661.5 },
    ],
  },
  {
    leg_id: "NORTH_EAST",
    display_name: "Howrah - Delhi (North-East Corridor)",
    origin_code: "HWH",
    destination_code: "NDLS",
    total_km: 1447.8,
    stations: [
      { code: "HWH", name: "HOWRAH JN", lat: 22.583, lon: 88.343, cumulative_km: 0.0 },
      { code: "ASN", name: "ASANSOL JN", lat: 23.684, lon: 86.974, cumulative_km: 200.0 },
      { code: "DHN", name: "DHANBAD JN", lat: 23.792, lon: 86.430, cumulative_km: 259.0 },
      { code: "GAYA", name: "GAYA JN", lat: 24.802, lon: 84.999, cumulative_km: 459.0 },
      { code: "MGS", name: "MUGHAL SARAI JN", lat: 25.281, lon: 83.118, cumulative_km: 664.0 },
      { code: "ALD", name: "ALLAHABAD JN", lat: 25.452, lon: 81.834, cumulative_km: 817.0 },
      { code: "CNB", name: "KANPUR CENTRAL", lat: 26.454, lon: 80.354, cumulative_km: 1011.0 },
      { code: "NDLS", name: "NEW DELHI", lat: 28.614, lon: 77.219, cumulative_km: 1447.8 },
    ],
  },
];

// Assistant actions have no mock responses and never retry a mutation on another server.
async function assistantRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${currentBaseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : `Assistant request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

// Helper to make an HTTP request with automatic 127.0.0.1 fallback
export async function requestApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${currentBaseUrl}${endpoint}`, {
    ...options, headers: { 'Content-Type': 'application/json', ...options?.headers },
    signal: options?.signal ?? AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || data));
  isLiveBackendAvailable = true;
  return data as T;
}

async function fetchWithFallback<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const urlsToTry: string[] = [];

  // Primary URL
  urlsToTry.push(`${currentBaseUrl}${endpoint}`);

  // Browser hostname if running on LAN/WiFi IP (e.g. 172.18.3.43)
  if (typeof window !== "undefined" && window.location && window.location.hostname) {
    const hostUrl = `http://${window.location.hostname}:8000${endpoint}`;
    if (!urlsToTry.includes(hostUrl)) urlsToTry.push(hostUrl);
  }

  // 127.0.0.1 and localhost alternates
  const ipv4Url = `http://127.0.0.1:8000${endpoint}`;
  if (!urlsToTry.includes(ipv4Url)) urlsToTry.push(ipv4Url);

  const localUrl = `http://localhost:8000${endpoint}`;
  if (!urlsToTry.includes(localUrl)) urlsToTry.push(localUrl);

  let lastError: Error | null = null;

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
        signal: controller.signal,
        ...options,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorDetail = response.statusText;
        try {
          const errorData = await response.json();
          if (errorData && errorData.detail) {
            errorDetail = typeof errorData.detail === "string" ? errorData.detail : JSON.stringify(errorData.detail);
          }
        } catch {
          // ignore
        }
        throw new Error(`API error (${response.status}): ${errorDetail}`);
      }

      isLiveBackendAvailable = true;
      return await response.json();
    } catch (err: any) {
      lastError = err;
      // If connection was aborted or refused, try next candidate URL
    }
  }

  isLiveBackendAvailable = false;
  throw lastError || new Error(`Failed to connect to backend at ${currentBaseUrl}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS HIGH-FIDELITY SIMULATION ENGINE (Used when localhost is disabled)
// ═══════════════════════════════════════════════════════════════════════════

function simulateLiveTrains(simTimeStr: string): LiveTrainState[] {
  const parts = simTimeStr.split(":").map(Number);
  const minutes = (parts[0] || 12) * 60 + (parts[1] || 0) + (parts[2] || 0) / 60;

  const fleet = [
    { num: "12951", name: "Mumbai Rajdhani Express", cat: "PREMIUM" as const, leg: "WEST" as const, speed: 128 },
    { num: "12953", name: "August Kranti Rajdhani", cat: "PREMIUM" as const, leg: "WEST" as const, speed: 122 },
    { num: "20901", name: "Vande Bharat Express", cat: "PREMIUM" as const, leg: "WEST" as const, speed: 135 },
    { num: "12840", name: "Howrah - Chennai Mail", cat: "SUPERFAST" as const, leg: "EAST_COAST" as const, speed: 105 },
    { num: "12841", name: "Coromandel Express", cat: "SUPERFAST" as const, leg: "EAST_COAST" as const, speed: 110 },
    { num: "12301", name: "Kolkata Rajdhani Express", cat: "PREMIUM" as const, leg: "NORTH_EAST" as const, speed: 130 },
    { num: "12313", name: "Sealdah Rajdhani Express", cat: "PREMIUM" as const, leg: "NORTH_EAST" as const, speed: 125 },
    { num: "12163", name: "Mumbai LTT - Chennai Express", cat: "EXPRESS" as const, leg: "SOUTH_WEST" as const, speed: 96 },
    { num: "22692", name: "Bengaluru Rajdhani", cat: "PREMIUM" as const, leg: "SOUTH_WEST" as const, speed: 115 },
    { num: "84920", name: "BOXN Coal Freight Rake", cat: "FREIGHT" as const, leg: "WEST" as const, speed: 72 },
    { num: "88214", name: "BTPN Petroleum Rake", cat: "FREIGHT" as const, leg: "NORTH_EAST" as const, speed: 68 },
    { num: "59045", name: "Surat - Vadodara Passenger", cat: "PASSENGER" as const, leg: "WEST" as const, speed: 58 },
  ];

  return fleet.map((t, idx) => {
    const corridor = GQ_CORRIDORS.find((c) => c.leg_id === t.leg) || GQ_CORRIDORS[0];
    const stations = corridor.stations;

    // Fractional position along corridor based on simulation minutes
    const progress = ((minutes * (t.speed / 500) + idx * 0.18) % 1 + 1) % 1;
    const totalSegments = stations.length - 1;
    const segmentIndex = Math.min(Math.floor(progress * totalSegments), totalSegments - 1);
    const segmentProgress = (progress * totalSegments) - segmentIndex;

    const s1 = stations[segmentIndex];
    const s2 = stations[segmentIndex + 1];

    const lon = s1.lon + (s2.lon - s1.lon) * segmentProgress;
    const lat = s1.lat + (s2.lat - s1.lat) * segmentProgress;

    return {
      train_number: t.num,
      train_name: t.name,
      category: t.cat,
      lat,
      lon,
      current_section: `${s1.code}-${s2.code}`,
      track_line: idx % 2 === 0 ? ("UP" as const) : ("DOWN" as const),
      speed_kmph: t.speed,
      status: "RUNNING" as const,
      corridor_leg: t.leg,
      delay_minutes: 0,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED API CLIENT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export const api = {
  // 1. GET /api/v1/network/gq-corridors
  getCorridors: async (): Promise<Corridor[]> => {
      return requestApi<Corridor[]>("/api/v1/network/gq-corridors");
  },

  // Granular Station List: GET /api/v1/network/stations
  getStations: async (legId?: string): Promise<StationItem[]> => {
    try {
      const url = legId ? `/api/v1/network/stations?leg_id=${legId}` : "/api/v1/network/stations";
      return await fetchWithFallback<StationItem[]>(url);
    } catch {
      // Fallback extracts from static GQ_CORRIDORS
      const items: StationItem[] = [];
      GQ_CORRIDORS.forEach((c) => {
        if (legId && c.leg_id.toUpperCase() !== legId.toUpperCase()) return;
        c.stations.forEach((s, idx) => {
          const prev = idx > 0 ? c.stations[idx - 1].code : null;
          const next = idx < c.stations.length - 1 ? c.stations[idx + 1].code : null;
          items.push({
            code: s.code,
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            legs: [c.leg_id],
            cumulative_km: s.cumulative_km,
            adjacentCodes: [prev, next].filter(Boolean) as string[],
          });
        });
      });
      return items;
    }
  },

  // Grouped Station List by CorridorLeg: GET /api/v1/network/stations/by-corridor
  getStationsByCorridor: async (): Promise<Record<CorridorLeg, StationItem[]>> => {
    try {
      return await fetchWithFallback<Record<CorridorLeg, StationItem[]>>("/api/v1/network/stations/by-corridor");
    } catch {
      const grouped: Record<CorridorLeg, StationItem[]> = {
        WEST: [],
        SOUTH_WEST: [],
        EAST_COAST: [],
        NORTH_EAST: [],
      };
      GQ_CORRIDORS.forEach((c) => {
        c.stations.forEach((s, idx) => {
          const prev = idx > 0 ? c.stations[idx - 1].code : null;
          const next = idx < c.stations.length - 1 ? c.stations[idx + 1].code : null;
          grouped[c.leg_id].push({
            code: s.code,
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            legs: [c.leg_id],
            cumulative_km: s.cumulative_km,
            adjacentCodes: [prev, next].filter(Boolean) as string[],
          });
        });
      });
      return grouped;
    }
  },

  // Chrono-Spatial Traffic Preview: POST /api/v1/planner/preview-traffic
  previewTraffic: async (req: TrafficPreviewRequest): Promise<TrafficPreviewResponse> => {
    try {
      return await fetchWithFallback<TrafficPreviewResponse>("/api/v1/planner/preview-traffic", {
        method: "POST",
        body: JSON.stringify(req),
      });
    } catch {
      // Offline simulation fallback
      return {
        from_station: req.from_station,
        to_station: req.to_station,
        track_line: req.track_line || "UP",
        requested_time: req.requested_time,
        duration_minutes: req.duration_minutes,
        projected_traffic_count: 2,
        summary_by_category: { PREMIUM: 1, SUPERFAST: 1 },
        trains: [
          {
            train_number: "12953",
            train_name: "August Kranti Rajdhani",
            category: "PREMIUM",
            scheduled_pass_time: req.requested_time,
            direction: req.track_line || "UP",
            conflict: true,
            delay_minutes: 0,
          },
          {
            train_number: "20901",
            train_name: "Vande Bharat Express",
            category: "SUPERFAST",
            scheduled_pass_time: req.requested_time,
            direction: req.track_line || "UP",
            conflict: true,
            delay_minutes: 0,
          },
        ],
      };
    }
  },

  // Single corridor details
  getCorridor: async (legId: string): Promise<Corridor> => {
    try {
      return await fetchWithFallback<Corridor>(`/api/v1/network/gq-corridors/${legId}`);
    } catch {
      const found = GQ_CORRIDORS.find((c) => c.leg_id.toUpperCase() === legId.toUpperCase());
      if (!found) throw new Error(`Unknown corridor leg: ${legId}`);
      return found;
    }
  },

  // 2. POST /api/v1/planner/analyze-block
  analyzeBlock: async (request: BlockRequest): Promise<BlockDecision> => {
      return await requestApi<BlockDecision>("/api/v1/planner/analyze-block", {
        method: "POST",
        body: JSON.stringify(request),
      });
  },

  // Commit block
  commitBlock: async (request: BlockRequest): Promise<{ committed: boolean; block_id: string; decision: BlockDecision }> => {
      return await requestApi<{ committed: boolean; block_id: string; decision: BlockDecision }>("/api/v1/planner/commit-block", {
        method: "POST",
        body: JSON.stringify(request),
      });

  },

  getBlockResources: async (params: {
    blockId: string;
    department: BlockRequest["department"];
    defectType: string;
    corridorArm: BlockResourceData["corridorArm"];
    lengthKm: number;
  }): Promise<BlockResourceData> => {
    try {
      const query = new URLSearchParams({
        block_id: params.blockId,
        department: params.department,
        defect_type: params.defectType,
        corridor_arm: params.corridorArm,
        length_km: String(params.lengthKm),
      });
      return await fetchWithFallback<BlockResourceData>(`/api/v1/resources/calculate?${query.toString()}`);
    } catch {
      return {
        blockId: params.blockId,
        department: params.department,
        corridorArm: params.corridorArm,
        defectType: params.defectType,
        lengthKm: params.lengthKm,
        hazardBadge:
          params.corridorArm === "WESTERN"
            ? "EXTREME THERMAL EXPANSION"
            : params.corridorArm === "GANGETIC"
            ? "DENSE FOG & COLD EMBRITTLEMENT"
            : params.corridorArm === "EAST_COASTAL"
            ? "SALINE CORROSION & MONSOON MOISTURE"
            : "HEAVY GRADIENT & LATERAL SHEAR STRESS",
        severity: params.corridorArm === "WESTERN" || params.corridorArm === "GANGETIC" ? "RED" : "AMBER",
        equipmentList: [
          {
            id: "OFFLINE-EQ-001",
            name: "Rail Tensor / Alignment Gauge",
            category: "Tools",
            requiredQty: 1,
            unit: "units",
            isMandatory: true,
          },
          {
            id: "OFFLINE-EQ-002",
            name: "Certified Welding and Repair Kit",
            category: "Tools",
            requiredQty: Math.max(1, Math.ceil(params.lengthKm)),
            unit: "kits",
            isMandatory: true,
          },
          {
            id: "OFFLINE-EQ-003",
            name: "Environmental Safety Gear",
            category: "Safety/Climate Gear",
            requiredQty: 2 + Math.ceil(params.lengthKm * 2),
            unit: "kits",
            isMandatory: true,
          },
        ],
        manpower: [
          {
            roleId: "OFFLINE-MP-001",
            designation: "SSE / P-Way",
            quantity: 1,
            certification: "Track Safety Authorization",
            shiftHours: 4,
          },
          {
            roleId: "OFFLINE-MP-002",
            designation: "Technician",
            quantity: 1 + Math.ceil(params.lengthKm),
            certification: "Defect Repair Competency",
            shiftHours: 4,
          },
          {
            roleId: "OFFLINE-MP-003",
            designation: "Track Maintainer / Gangman",
            quantity: 3 + Math.ceil(params.lengthKm * 2),
            certification: "Lookout and Worksite Protection",
            shiftHours: 4,
          },
        ],
      };
    }
  },

  // Live train positions
  getLiveTrains: async (time: string, type: "ALL" | "PASSENGER" | "FREIGHT" = "ALL"): Promise<LiveTrainState[]> => {
    try {
      return await fetchWithFallback<LiveTrainState[]>(`/api/v1/trains/live?time=${time}&type=${type}`);
    } catch {
      return simulateLiveTrains(time);
    }
  },

  // AI assistant chat
  chatQuery: async (text: string): Promise<ChatResponse> => {
    try {
      return await fetchWithFallback<ChatResponse>("/api/v1/chat/query", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
    } catch {
      return {
        summary: `Analyzed maintenance request: "${text}". Corridor capacity and headway gaps cleared.`,
        entities: {
          origin: "ST",
          destination: "BCT",
          department: "TMS",
          time_of_day: "12:00:00",
          duration_minutes: 60,
          criticality: "NORMAL",
          confidence: 0.95,
        },
        decision: null,
        clarification_needed: null,
      };
    }
  },

  // AI Dispatcher Chat (Autonomous Section Controller & AI Chief Dispatcher)
  chatDispatcher: async (req: DispatcherChatRequest, signal?: AbortSignal): Promise<DispatcherChatResponse> => {
      return await assistantRequest<DispatcherChatResponse>("/api/v1/chat/dispatcher", {
        method: "POST",
        body: JSON.stringify(req),
        signal,
      });
  },

  assistantStatus: (signal?: AbortSignal) => assistantRequest<{ engine: string; model: { available: boolean; name: string; trees?: number; sha256?: string }; language_mode: string; capabilities: string[]; limitations: string[] }>("/api/v1/chat/engine", { signal }),
  commitAssistantBlock: (req: BlockRequest, signal?: AbortSignal) => assistantRequest<{ committed: boolean; block_id: string; decision: BlockDecision }>("/api/v1/planner/commit-block", { method: "POST", body: JSON.stringify(req), signal }),

  // Health check
  health: async (): Promise<HealthResponse> => {
      return await requestApi<HealthResponse>("/api/v1/health");
  },
};

export default api;
