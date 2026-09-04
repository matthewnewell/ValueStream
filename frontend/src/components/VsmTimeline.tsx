import { useNavigate } from 'react-router-dom'
import type { MapDetail, MapMetrics } from '../api/types'
import { formatDuration } from '../lib/duration'
import './VsmTimeline.css'

interface VsmTimelineProps {
  map: MapDetail
  metrics: MapMetrics
}

/** The classic VSM sawtooth: value-add boxes and wait gaps drawn to scale, back to back,
 * along the critical path only — the ordered sequence, not the full canvas graph, since a
 * linear timeline can't represent branches. Box width ~ processing time; gap width ~ wait
 * time. This is deliberately the same visual grammar Rother & Shook's VSM uses: the "silent
 * killer" gaps take up real, comparable space next to the work, instead of being an
 * afterthought line on a Gantt chart.
 *
 * A box for a step that owns a sub-process is a button: clicking it drills into that child
 * map's BLUF, the same "arriving at a map lands on its summary" rule the editor uses. */
export default function VsmTimeline({ map, metrics }: VsmTimelineProps) {
  const navigate = useNavigate()
  const stepsById = new Map(map.steps.map((s) => [s.id, s]))
  const edgesById = new Map(map.edges.map((e) => [e.id, e]))
  const pathSteps = metrics.critical_path_step_ids
  const pathEdges = metrics.critical_path_edge_ids

  if (pathSteps.length === 0) {
    return (
      <div className="vsm-timeline vsm-timeline--empty">
        Add steps and connect them to see the timeline.
      </div>
    )
  }

  return (
    <div className="vsm-timeline">
      <div className="vsm-timeline__track">
        {pathSteps.map((stepId, i) => {
          const step = stepsById.get(stepId)
          const sm = metrics.step_metrics[stepId]
          const processingSec = sm?.effective_processing_sec ?? 0
          const edgeId = pathEdges[i]
          const edge = edgeId ? edgesById.get(edgeId) : undefined
          const childMapId = sm?.child_map_id ?? null

          const boxInner = (
            <>
              <div className="vsm-timeline__box-name">{step?.name}</div>
              <div className="vsm-timeline__box-duration">{formatDuration(processingSec)}</div>
            </>
          )

          return (
            <div className="vsm-timeline__segment-pair" key={stepId}>
              {childMapId ? (
                <button
                  type="button"
                  className="vsm-timeline__box vsm-timeline__box--drillable"
                  style={{ flexGrow: Math.max(processingSec, 1) }}
                  title={`${step?.name} — open its ${sm?.child_step_count ?? ''}-step sub-process`}
                  onClick={() => navigate(`/maps/${childMapId}/bluf`)}
                >
                  <span className="vsm-timeline__drill-badge">
                    ⤵ {sm?.child_step_count ?? ''}
                  </span>
                  {boxInner}
                </button>
              ) : (
                <div
                  className="vsm-timeline__box"
                  style={{ flexGrow: Math.max(processingSec, 1) }}
                  title={`${step?.name} — ${formatDuration(processingSec)} of value-add work`}
                >
                  {boxInner}
                </div>
              )}

              {edge && (
                <div
                  className="vsm-timeline__gap"
                  style={{ flexGrow: Math.max(edge.wait_time_sec, 1) }}
                  title={`Wait: ${formatDuration(edge.wait_time_sec)}${edge.label ? ` — ${edge.label}` : ''}`}
                >
                  <div className="vsm-timeline__gap-duration">
                    ⏳ {formatDuration(edge.wait_time_sec)}
                  </div>
                  <div
                    className={`vsm-timeline__gap-label${!edge.label ? ' vsm-timeline__gap-label--missing' : ''}`}
                  >
                    {edge.label || "unlabeled — what's this wait for?"}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="vsm-timeline__legend">
        <span className="vsm-timeline__legend-item">
          <span className="vsm-timeline__legend-swatch vsm-timeline__legend-swatch--work" />
          Value-add work
        </span>
        <span className="vsm-timeline__legend-item">
          <span className="vsm-timeline__legend-swatch vsm-timeline__legend-swatch--wait" />
          Wait — the silent killer
        </span>
        <span className="vsm-timeline__legend-item vsm-timeline__legend-item--hint">
          ⤵ has a sub-process — click to drill in
        </span>
      </div>
    </div>
  )
}
