import type { MapMetrics } from '../api/types'
import { formatDuration } from '../lib/duration'
import './MetricsBar.css'

interface MetricsBarProps {
  metrics: MapMetrics | undefined
  isLoading: boolean
  /** Omitted on a read-only (featured/published) map — no "+ Add step" there. */
  onAddStep?: () => void
}

/** The Node view's own strip: the map-wide numbers, plus the one action unique to this view.
 * The "where to focus" reads (bottleneck, dominant delay) live on the Timeline view — no need
 * to repeat them while you're editing structure here. */
export default function MetricsBar({ metrics, isLoading, onAddStep }: MetricsBarProps) {
  const warnings: string[] = []
  if (metrics) {
    if (metrics.disconnected_step_ids.length > 0) {
      warnings.push(
        `${metrics.disconnected_step_ids.length} step${metrics.disconnected_step_ids.length > 1 ? 's' : ''} not connected to the main flow`,
      )
    }
    if (metrics.cycles_detected.length > 0) {
      warnings.push(
        `${metrics.cycles_detected.length} loop(s) detected and excluded from lead-time calc`,
      )
    }
  }

  return (
    <div className="metrics-bar">
      {isLoading || !metrics ? (
        <span className="metrics-bar__loading">Computing metrics…</span>
      ) : (
        <>
          <div className="metrics-bar__stats">
            <div className="metrics-bar__stat">
              <span className="metrics-bar__stat-label">Lead time</span>
              <span className="metrics-bar__stat-value">
                {formatDuration(metrics.lead_time_sec)}
                {metrics.expected_lead_time_sec > metrics.lead_time_sec + 1 && (
                  <span className="metrics-bar__stat-sub">
                    {' '}
                    · ~{formatDuration(metrics.expected_lead_time_sec)} w/ rework
                  </span>
                )}
              </span>
            </div>
            <div className="metrics-bar__stat">
              <span className="metrics-bar__stat-label">Processing time</span>
              <span className="metrics-bar__stat-value">
                {formatDuration(metrics.total_processing_time_sec)}
              </span>
            </div>
            <div className="metrics-bar__stat">
              <span className="metrics-bar__stat-label">Process cycle efficiency</span>
              <span className="metrics-bar__stat-value">
                {metrics.process_cycle_efficiency_pct.toFixed(1)}%
              </span>
            </div>
            {metrics.rolled_pct_ca != null && (
              <div className="metrics-bar__stat">
                <span className="metrics-bar__stat-label">Rolled %C&amp;A</span>
                <span className="metrics-bar__stat-value">
                  {metrics.rolled_pct_ca.toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {warnings.length > 0 && (
            <div className="metrics-bar__warnings">
              {warnings.map((w) => (
                <span key={w} className="metrics-bar__warning">
                  ⚠ {w}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {onAddStep && (
        <button className="metrics-bar__add" onClick={onAddStep}>
          + Add step
        </button>
      )}
    </div>
  )
}
