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
  /** Set only through POST /steps/:id/expand — never editable via PUT. */
  child_map_id: string | null
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
  has_child_map: boolean
}

/** One hop in a deepest-bottleneck breadcrumb: "at this map, this step is where the deeper
 * bottleneck lives" — distinct from MapBreadcrumbEntry below (the plain map/step nav trail). */
export interface BreadcrumbHop {
  map_id: string
  map_name: string
  step_id: string
  step_name: string
}

/** One entry in GET /api/maps/:id/breadcrumb — the "Value Stream > Design > ..." nav trail.
 * Root-first; `via_step_name` is the step in the PREVIOUS entry's map that drills down into
 * this entry's map, null for the root (nothing drills into the top-level map). */
export interface MapBreadcrumbEntry {
  map_id: string
  map_name: string
  via_step_name: string | null
}

/** The bottleneck, drilled down through however many levels of nested sub-processes to the
 * actual leaf step — e.g. "Design" (a rolled-up 3.2 wks) turns out to really be dominated by
 * "Trade Study" two levels down. `breadcrumb` is root-first, ending at this step's own map. */
export interface DeepestBottleneck extends Bottleneck {
  breadcrumb: BreadcrumbHop[]
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
  has_child_map: boolean
  child_map_id: string | null
  child_step_count: number | null
  /** Effective duration used for CPM at this level — own human+machine time for a leaf, or
   * the child map's own rolled-up lead time for a step that owns a sub-process. Always what
   * the UI should display; never read step.human_time_sec/machine_time_sec directly once a
   * step has a child map, since those raw fields go stale/irrelevant once expanded. */
  effective_processing_sec: number
  effective_human_sec: number
  effective_machine_sec: number
  /** Wait time rolled up from inside a child map (e.g. a CCB/approval cycle) — 0 for a
   * leaf step, since its own wait lives on its edges, not on it. */
  effective_wait_sec: number
}

export interface MapMetrics {
  lead_time_sec: number
  total_processing_time_sec: number
  total_human_time_sec: number
  total_machine_time_sec: number
  process_cycle_efficiency_pct: number
  bottleneck: Bottleneck | null
  deepest_bottleneck: DeepestBottleneck | null
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
