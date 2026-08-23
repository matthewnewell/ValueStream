export interface MapSummary {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  step_count: number
}

export interface Step {
  id: string
  map_id: string
  name: string
  description: string | null
  pos_x: number
  pos_y: number
  human_time_sec: number
  machine_time_sec: number
  operators: number
  machines: number
  notes: string | null
  ai_rationale: string | null
}

export interface Edge {
  id: string
  map_id: string
  source_step_id: string
  target_step_id: string
  wait_time_sec: number
  label: string | null
  kind: string
}

export interface MapDetail extends MapSummary {
  steps: Step[]
  edges: Edge[]
}

export interface Bottleneck {
  step_id: string
  name: string
  processing_time_sec: number
  on_critical_path: boolean
}

export interface WaitContributor {
  edge_id: string
  source_step_id: string
  source_step_name: string | null
  target_step_id: string
  target_step_name: string | null
  wait_time_sec: number
}

export interface CycleEdge {
  edge_id: string
  source_step_id: string
  target_step_id: string
}

export interface StepMetric {
  earliest_start_sec: number | null
  earliest_finish_sec: number | null
  latest_start_sec: number | null
  latest_finish_sec: number | null
  slack_sec: number | null
  is_critical: boolean
  pct_of_lead_time: number
}

export interface MapMetrics {
  lead_time_sec: number
  total_processing_time_sec: number
  process_cycle_efficiency_pct: number
  bottleneck: Bottleneck | null
  critical_step_ids: string[]
  critical_edge_ids: string[]
  top_wait_contributors: WaitContributor[]
  disconnected_step_ids: string[]
  cycles_detected: CycleEdge[]
  step_metrics: Record<string, StepMetric>
  step_count: number
  edge_count: number
}

export interface AiSuggestResult {
  human_time_sec: number
  machine_time_sec: number
  operators: number
  machines: number
  rationale: string
  error?: string
}

export interface AiInsightsResult {
  narrative: string
  metrics: MapMetrics
  error?: string
}
