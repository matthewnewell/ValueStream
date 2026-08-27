import { useNavigate, useParams } from 'react-router-dom'
import { useAiInsights, useHealth, useMap, useMapMetrics } from '../api/hooks'
import Breadcrumb from '../components/Breadcrumb'
import VsmTimeline from '../components/VsmTimeline'
import { formatDuration } from '../lib/duration'
import './BlufPage.css'

export default function BlufPage() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { data: map, isLoading: mapLoading } = useMap(mapId)
  const { data: metrics, isLoading: metricsLoading } = useMapMetrics(mapId)
  const { data: health } = useHealth()
  const aiInsights = useAiInsights(mapId ?? '')

  if (!mapId) return null
  if (mapLoading || metricsLoading || !map || !metrics) {
    return <div className="bluf-page__loading">Loading…</div>
  }

  const db = metrics.deepest_bottleneck
  const isNested = db && db.breadcrumb.length > 1

  return (
    <div className="bluf-page">
      <Breadcrumb mapId={mapId} />
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
            <div className="bluf-card__label">Bottleneck</div>
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
        </section>

        <section className="bluf-section">
          <h2 className="bluf-section__title">Why wait time compounds — Little's Law</h2>
          <p className="bluf-section__body">
            Little's Law states <code>Lead Time = WIP ÷ Throughput Rate</code>: the more work
            sitting in queue at once, the longer any single piece waits, independent of how
            fast any one step runs. This app tracks a single part's journey — it doesn't model
            order volume or how many units are in process at once, so there's no number to show
            you here. But it's the reason a "fast" process can still have a terrible lead time:
            queues compound faster than intuition expects. If the wait segments below are large,
            that's very likely Little's Law showing up in your own value stream, not a fluke.
          </p>
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
                    </td>
                    <td>
                      {w.label || (
                        <span className="bluf-table__missing-label">no label</span>
                      )}
                    </td>
                    <td className="bluf-table__duration">{formatDuration(w.wait_time_sec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bluf-section">
          <div className="bluf-section__header-row">
            <h2 className="bluf-section__title">✨ AI Narrative</h2>
            {health?.ai_configured && (
              <button
                className="bluf-section__ai-btn"
                onClick={() => aiInsights.mutate()}
                disabled={aiInsights.isPending}
              >
                {aiInsights.isPending ? 'Analyzing…' : aiInsights.data ? 'Re-analyze' : 'Analyze'}
              </button>
            )}
          </div>
          {!health?.ai_configured && (
            <p className="bluf-section__body bluf-section__body--muted">
              AI is not configured for this instance — everything above is computed without it.
              Set <code>AI_PROVIDER</code> to enable a written narrative here too.
            </p>
          )}
          {aiInsights.data?.narrative && (
            <div className="bluf-section__narrative">
              {aiInsights.data.narrative.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
          {aiInsights.data?.error && (
            <p className="bluf-section__body bluf-section__body--error">{aiInsights.data.error}</p>
          )}
        </section>
      </div>
    </div>
  )
}
