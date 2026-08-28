import { useNavigate, useParams } from 'react-router-dom'
import { useMap, useMapMetrics } from '../api/hooks'
import VsmTimeline from '../components/VsmTimeline'
import { formatDuration } from '../lib/duration'
import './BlufPage.css'

export default function BlufPage() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { data: map, isLoading: mapLoading } = useMap(mapId)
  const { data: metrics, isLoading: metricsLoading } = useMapMetrics(mapId)

  if (!mapId) return null
  if (mapLoading || metricsLoading || !map || !metrics) {
    return <div className="bluf-page__loading">Loading…</div>
  }

  const db = metrics.deepest_bottleneck
  const isNested = db && db.breadcrumb.length > 1

  return (
    <div className="bluf-page">
      <div className="bluf-page__toolbar">
        <button className="bluf-page__back" onClick={() => navigate('/')}>
          ← Maps
        </button>
        <h1 className="bluf-page__title">{map.name} — BLUF</h1>
        <button className="bluf-page__edit-btn" onClick={() => navigate(`/maps/${mapId}`)}>
          ✏️ Edit map
        </button>
      </div>

      <div className="bluf-page__content">
        <section className="bluf-section">
          <h2 className="bluf-section__title">Value Stream Timeline</h2>
          <p className="bluf-section__subtitle">
            The critical path only — the one sequence of steps that actually determines lead
            time — drawn to scale. Striped segments are wait time, not work.
          </p>
          <VsmTimeline map={map} metrics={metrics} />
        </section>

        <section className="bluf-grid">
          <div className="bluf-card">
            <div className="bluf-card__label">Lead Time</div>
            <div className="bluf-card__value">{formatDuration(metrics.lead_time_sec)}</div>
            <div className="bluf-card__note">
              {formatDuration(metrics.total_processing_time_sec)} of that is actual work
            </div>
          </div>

          <div className="bluf-card">
            <div className="bluf-card__label">Process Cycle Efficiency</div>
            <div className="bluf-card__value">
              {metrics.process_cycle_efficiency_pct.toFixed(1)}%
            </div>
            <div className="bluf-card__note">
              {metrics.process_cycle_efficiency_pct < 25
                ? 'Most of your lead time is waiting, not working.'
                : metrics.process_cycle_efficiency_pct < 60
                  ? 'A meaningful share of lead time is still wait, not work.'
                  : 'Most of your lead time is real work — the seams are under control.'}
            </div>
          </div>

          <div className="bluf-card bluf-card--bottleneck">
            <div className="bluf-card__label" title="The busiest single work step — the constraint on throughput. Not necessarily what's driving the calendar; see Dominant Delay for that.">
              Capacity Bottleneck
            </div>
            {db ? (
              <>
                <div className="bluf-card__value">🔥 {db.name}</div>
                <div className="bluf-card__note">
                  {formatDuration(db.processing_time_sec)}
                  {!db.on_critical_path && ' — off the critical path'}
                  {isNested && (
                    <>
                      {' '}
                      — inside{' '}
                      {db.breadcrumb
                        .slice(0, -1)
                        .map((h) => h.step_name)
                        .join(' › ')}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="bluf-card__value">—</div>
            )}
          </div>

          {metrics.wait_contributors.length > 0 && (
            <div className="bluf-card bluf-card--delay">
              <div className="bluf-card__label" title="The single biggest driver of THIS map's lead time — often a different step than the capacity bottleneck above.">
                Dominant Delay
              </div>
              <div className="bluf-card__value">
                ⏳ {metrics.wait_contributors[0].source_step_name}
                {' → '}
                {metrics.wait_contributors[0].target_step_name}
              </div>
              <div className="bluf-card__note">
                {formatDuration(metrics.wait_contributors[0].wait_time_sec)}
                {metrics.wait_contributors[0].label && ` — ${metrics.wait_contributors[0].label}`}
              </div>
            </div>
          )}
        </section>

        <section className="bluf-section">
          <div className="bluf-section__header-row">
            <h2 className="bluf-section__title">
              Wait Contributors ({metrics.wait_contributors.length})
            </h2>
          </div>
          {metrics.wait_contributors.length === 0 ? (
            <p className="bluf-section__body">No wait time recorded anywhere in this map.</p>
          ) : (
            <>
              {(metrics.wait_by_kind_sec.internal > 0 || metrics.wait_by_kind_sec.external > 0) && (
                <p className="bluf-section__body bluf-section__body--muted">
                  Of the wait time above,{' '}
                  <strong>{formatDuration(metrics.wait_by_kind_sec.internal)}</strong> is inside
                  your control (internal — approvals, sign-offs, holds) and{' '}
                  <strong>{formatDuration(metrics.wait_by_kind_sec.external)}</strong> is outside
                  it (external — vendor/shipping)
                  {metrics.wait_by_kind_sec.unspecified > 0 && (
                    <>
                      {' '}
                      ({formatDuration(metrics.wait_by_kind_sec.unspecified)} not yet categorized)
                    </>
                  )}
                  .
                </p>
              )}
              <table className="bluf-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Connector</th>
                    <th>What it's waiting for</th>
                    <th>Wait time</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.wait_contributors.map((w, i) => (
                    <tr key={w.edge_id}>
                      <td>{i + 1}</td>
                      <td>
                        {w.source_step_name} <span className="bluf-table__arrow">→</span>{' '}
                        {w.target_step_name}
                        {w.wait_kind && (
                          <span
                            className={`bluf-table__kind-badge bluf-table__kind-badge--${w.wait_kind}`}
                          >
                            {w.wait_kind}
                          </span>
                        )}
                        {w.slip_amplification && (
                          <div className="bluf-table__slip-badge">
                            ⚠ slip risk — a short delay here can miss the{' '}
                            {formatDuration(w.slip_amplification.protects_wait_sec)} window it
                            gates (
                            {w.slip_amplification.protects_label ||
                              w.slip_amplification.protects_target_step_name}
                            )
                          </div>
                        )}
                      </td>
                      <td>
                        {w.label || <span className="bluf-table__missing-label">no label</span>}
                      </td>
                      <td className="bluf-table__duration">{formatDuration(w.wait_time_sec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
