import type { MapMetrics } from '../api/types'
import { formatDuration } from '../lib/duration'
import './MetricsBar.css'

interface MetricsBarProps {
  metrics: MapMetrics | undefined
  isLoading: boolean
}

export default function MetricsBar({ metrics, isLoading }: MetricsBarProps) {
  if (isLoading || !metrics) {
    return (
      <div className="metrics-bar metrics-bar--loading">
        <span>Computing metrics…</span>
      </div>
    )
  }

  const warnings: string[] = []
  if (metrics.disconnected_step_ids.length > 0) {
    warnings.push(
      `${metrics.disconnected_step_ids.length} step${metrics.disconnected_step_ids.length > 1 ? 's' : ''} not connected to the main flow`,
    )
  }
  if (metrics.cycles_detected.length > 0) {
    warnings.push(`${metrics.cycles_detected.length} loop(s) detected and excluded from lead-time calc`)
  }

  return (
    <div className="metrics-bar">
      <div className="metrics-bar__stat">
        <span className="metrics-bar__stat-label">Lead time</span>
        <span className="metrics-bar__stat-value">{formatDuration(metrics.lead_time_sec)}</span>
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
      <div className="metrics-bar__divider" />
      <div className="metrics-bar__stat metrics-bar__stat--bottleneck">
        <span className="metrics-bar__stat-label">Bottleneck</span>
        <span className="metrics-bar__stat-value">
          {metrics.bottleneck ? (
            <>
              🔥 {metrics.bottleneck.name}{' '}
              <span className="metrics-bar__stat-sub">
                ({formatDuration(metrics.bottleneck.processing_time_sec)}
                {!metrics.bottleneck.on_critical_path && ', off critical path'})
              </span>
            </>
          ) : (
            '—'
          )}
        </span>
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
    </div>
  )
}
