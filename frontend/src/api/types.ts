export interface MapSummary {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  step_count: number
  /** Library maps (seeded or promoted starting points) never appear in the main map list —
   * see GET /api/maps/templates. Cloning one (the same duplicate endpoint every map uses)
   * always produces a normal map with is_template false. */
  is_template: boolean
  /** Cosmetic grouping label for the library UI (e.g. "Technical Processes"). Null on
   * ordinary project maps. */
  template_category: string | null
  /** Which portfolio / project this value stream belongs to — plain labels Value Stream keeps
   * its own copy of (the Depot is the ecosystem's project system of record). Null on templates
   * and unfiled maps. The main list groups and filters on these. */
  portfolio: string | null
  project: string | null
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

/** Who can act on a wait: "internal" (the operator's own org controls it — approvals,
 * sign-offs, QA holds) vs "external" (outside their control — vendor lead time, shipping).
 * null/unset means not yet categorized. */
export type WaitKind = 'internal' | 'external' | null

export interface Edge {
  id: string
  map_id: string
  source_step_id: string
  target_step_id: string
  wait_time_sec: number
  label: string | null
  kind: string
  wait_kind: WaitKind
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

/** A short wait sitting immediately before a much longer one, on the critical path — flagged
 * when the downstream wait is at least 3x this one. A short internal window (a PO approval)
 * that gates a long external one (foundry lead time) is riskier than its own duration
 * suggests: miss it and you don't just lose a day, you can miss the whole downstream window
 * and lose the next cycle. */
export interface SlipAmplification {
  protects_wait_sec: number
  protects_label: string | null
  protects_target_step_name: string | null
}

/** One connector with wait time > 0, worst-first — engine.py returns EVERY one of these, no
 * top-N cutoff. How many to show is a display decision for the component rendering the list,
 * not something baked into the data. */
export interface WaitContributor {
  edge_id: string
  source_step_id: string
  source_step_name: string | null
  target_step_id: string
  target_step_name: string | null
  wait_time_sec: number
  label: string | null
  wait_kind: WaitKind
  slip_amplification: SlipAmplification | null
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
  /** One ordered walk of the critical path, source to sink — for a linear VSM timeline.
   * Distinct from critical_step_ids/critical_edge_ids (the full *set* of zero-slack
   * nodes/edges, correct under ties, used for canvas highlighting — not orderable as a
   * single sequence when there's more than one equally-long path). */
  critical_path_step_ids: string[]
  critical_path_edge_ids: string[]
  wait_contributors: WaitContributor[]
  /** Total wait time bucketed by who can act on it — keys always "internal"/"external"/
   * "unspecified", values in seconds. Map-wide, same scope as wait_contributors. */
  wait_by_kind_sec: { internal: number; external: number; unspecified: number }
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

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  reply: string
  error?: string
}
