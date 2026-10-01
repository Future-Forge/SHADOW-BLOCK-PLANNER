export type CorridorLeg = "WEST" | "SOUTH_WEST" | "EAST_COAST" | "NORTH_EAST";

export interface CorridorStation {
  code: string;
  name: string;
  lat: number;
  lon: number;
  cumulative_km: number;
}

export interface StationItem {
  code: string;
  name: string;
  lat: number;
  lon: number;
  cumulative_km?: number;
  legs: CorridorLeg[];
  adjacentCodes: string[];
  zone?: string | null;
  is_junction?: boolean;
}

export type StationsByCorridorResponse = Record<CorridorLeg, StationItem[]>;

export interface CorridorTelemetry {
  corridor_id: string;
  path: [number, number][];
  timestamps: number[];
  congestion_score: number;
  status: "CRITICAL" | "NORMAL" | "CAUTION" | string;
}

export interface Corridor {
  id?: string;
  name?: string;
  distance?: number;
  leg_id: CorridorLeg;
  display_name: string;
  origin_code: string;
  destination_code: string;
  total_km: number;
  stations: CorridorStation[];
  corridor_id?: string;
  path?: [number, number][];
  timestamps?: number[];
  congestion_score?: number;
  status?: "CRITICAL" | "NORMAL" | "CAUTION" | string;
}

export interface LiveTrainState {
  train_number: string;
  train_name: string;
  category: "PREMIUM" | "SUPERFAST" | "EXPRESS" | "PASSENGER" | "FREIGHT";
  lat: number;
  lon: number;
  current_section: string;
  track_line: "UP" | "DOWN";
  speed_kmph: number;
  status: "RUNNING" | "LOOPED" | "HELD" | "DIVERTED";
  corridor_leg: CorridorLeg | null;
  delay_minutes: number;
  heading?: number;
  bearing?: number;
}


export interface BlockRequest {
  from_station: string;
  to_station: string;
  track_line: "UP" | "DOWN";
  requested_time: string;
  duration_minutes: number;
  department: "TMS" | "SMMS" | "TDMS";
  criticality: "NORMAL" | "MAJOR" | "EMERGENCY";
  operation_date?: string;
  shared_tasks?: { department: BlockRequest['department']; duration_minutes: number }[];
  parallel_work_confirmed?: boolean;
  weather?: { mode: 'seasonal' | 'clear' | 'heavy_rain' | 'high_wind' | 'severe'; exposed_work: boolean };
  resource_capacity?: Record<string, number>;
}

export interface AffectedTrain {
  train_number: string;
  train_name: string;
  category: "PREMIUM" | "SUPERFAST" | "EXPRESS" | "PASSENGER" | "FREIGHT";
  action: "NONE" | "HOLD" | "CAUTION" | "LOOP" | "DIVERT";
  hold_station: string | null;
  delay_minutes: number;
  scheduled_pass_time?: string;
}

export interface TrafficPreviewItem {
  train_number: string;
  train_name: string;
  category: "PREMIUM" | "SUPERFAST" | "EXPRESS" | "PASSENGER" | "FREIGHT";
  scheduled_pass_time: string;
  direction: "UP" | "DOWN";
  conflict: boolean;
  delay_minutes: number;
}

export interface TrafficPreviewRequest {
  from_station: string;
  to_station: string;
  track_line?: "UP" | "DOWN";
  requested_time: string;
  duration_minutes: number;
}

export interface TrafficPreviewResponse {
  from_station: string;
  to_station: string;
  track_line: "UP" | "DOWN";
  requested_time: string;
  duration_minutes: number;
  projected_traffic_count: number;
  summary_by_category: Record<string, number>;
  trains: TrafficPreviewItem[];
}

export interface AlternativeWindow {
  start: string;
  end: string;
  duration_minutes: number;
}

export interface BlockDecision {
  status: "APPROVED" | "APPROVED_WITH_REGULATION" | "REJECTED" | "PENDING_REVIEW";
  block_window: { start: string; end: string };
  affected_trains: AffectedTrain[];
  max_available_gap_nearby: AlternativeWindow | null;
  asset_availability_index: number;
  total_weighted_delay_cost: number | null;
  notes: string | null;
  block_geometry?: [number, number][];
  planning?: import('./planning').PlanningDetails;
  block_id?: string;
}

export interface ActiveBlock {
  id: string;
  request: BlockRequest;
  decision: BlockDecision;
  committedAt: string;
}

export interface ChatEntities {
  origin: string | null;
  destination: string | null;
  department: "TMS" | "SMMS" | "TDMS" | null;
  time_of_day: string | null;
  duration_minutes: number | null;
  criticality: "NORMAL" | "MAJOR" | "EMERGENCY" | null;
  confidence: number;
}

export interface ChatResponse {
  summary: string;
  entities: ChatEntities;
  decision: BlockDecision | null;
  clarification_needed: string | null;
}

export interface HealthResponse {
  status: "ok" | "starting";
  stations_loaded: number;
  trains_loaded: number;
  indexed_block_sections: number;
}

export interface FlyToTarget {
  lat: number;
  lon: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
}

export interface DispatcherChatRequest {
  message: string;
  session_id?: string;
  sim_time?: string;
}

export interface DispatcherChatResponse {
  response_text: string;
  action_triggered: "EXECUTE_BLOCK" | "ANALYZE_GAP" | "TRAIN_INSPECT" | "RESEQUENCE" | "DOWNLOAD_CSV" | "NONE";
  payload: Record<string, any>;
  fly_to_target?: FlyToTarget | null;
}

export type EquipmentCategory = "Tools" | "Heavy Machinery" | "Safety/Climate Gear";
export type HazardSeverity = "RED" | "AMBER" | "YELLOW";

export interface EquipmentItem {
  id: string;
  name: string;
  category: EquipmentCategory;
  requiredQty: number;
  unit: string;
  isMandatory: boolean;
}

export interface ManpowerRole {
  roleId: string;
  designation: string;
  quantity: number;
  certification: string;
  shiftHours: number;
}

export interface BlockResourceData {
  blockId: string;
  department: "TMS" | "SMMS" | "TDMS";
  corridorArm: "WESTERN" | "GANGETIC" | "EAST_COASTAL" | "DECCAN";
  defectType: string;
  lengthKm: number;
  hazardBadge: string;
  severity: HazardSeverity;
  equipmentList: EquipmentItem[];
  manpower: ManpowerRole[];
}
