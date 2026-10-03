import { requestApi } from './api';
import type { BlockDecision, BlockRequest } from './types';

export interface Evaluation {
  baseline: string;
  baseline_delay_minutes: number;
  planned_delay_minutes: number;
  delay_minutes_saved: number | null;
  baseline_feasible: boolean;
  baseline_weighted_cost: number;
  planned_weighted_cost: number;
  feasible: boolean;
}
export interface PlanningDetails {
  operation_date: string;
  corridor: string;
  start_iso: string;
  end_iso: string;
  effective_duration_minutes: number;
  shared_minutes_saved: number;
  explanations: string[];
  blocking_reasons: string[];
  limitations: string[];
  resource_basis: string;
  weather: { condition: string; region: string; duration_multiplier: number; train_delay_minutes: number; restricted: boolean; basis: string; source_url: string };
  resources: { resource: string; required: number; reserved: number; capacity: number; available: number; sufficient: boolean }[];
  comparison: { train_number: string; train_name: string; category: string; scheduled_entry_min: number; without_block_entry_min: number; with_block_entry_min: number; weather_delay_minutes: number; block_delay_minutes: number; total_delay_minutes: number; hold_station: string }[];
  evaluation: Evaluation;
}
export interface Operation {
  block_id: string; created_at: string; operation_date: string; status: string;
  department: string; from_station: string; to_station: string; start_time: string;
  duration_minutes: number;
  snapshot?: { request: BlockRequest; decision: BlockDecision };
}
export interface Replay { block_id: string; original?: Evaluation; replay: Evaluation; explanations: string[]; limitations: string[] }

export async function planningFetch<T>(path: string, body?: unknown): Promise<T> {
  return requestApi<T>(`/api/v1/planner${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

}
