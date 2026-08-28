import type { MapMetrics, WaitContributor } from '../api/types'
import { formatDuration } from '../lib/duration'
import './WaitContributorsPanel.css'

interface WaitContributorsPanelProps {
  contributors: WaitContributor[]
  waitByKind: MapMetrics['wait_by_kind_sec'] | undefined
  onClose: () => void
  onSelectEdge: (edgeId: string) => void
}

/** Every wait-bearing connector, worst first — the engine already sorts and returns all of
 * them (no top-N cutoff), so this component just renders the list as-is. Clicking a row
 * selects that connector on the canvas, which opens EdgeDrawer to edit/label it. */
export default function WaitContributorsPanel({
  contributors,
  waitByKind,
  onClose,
  onSelectEdge,
}: WaitContributorsPanelProps) {
  const totalWait = contributors.reduce((sum, c) => sum + c.wait_time_sec, 0)
  const unlabeled = contributors.filter((c) => !c.label).length

  return (
    <div className="wait-panel">
      <div className="wait-panel__header">
        <h3>⏳ Wait Contributors</h3>
        <button className="wait-panel__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {contributors.length === 0 ? (
        <div className="wait-panel__empty">
          No wait time recorded anywhere in this map yet. Every connector is currently 0 —
          click one on the canvas to set it.
        </div>
      ) : (
        <>
          <div className="wait-panel__summary">
            <span>
              {contributors.length} connector{contributors.length !== 1 ? 's' : ''} carry wait
              time, totaling <strong>{formatDuration(totalWait)}</strong>
            </span>
            {unlabeled > 0 && (
              <span className="wait-panel__unlabeled-note">
                ⚠ {unlabeled} unlabeled — worth naming what each gap is actually waiting on
              </span>
            )}
            {waitByKind && (waitByKind.internal > 0 || waitByKind.external > 0) && (
              <span>
                {formatDuration(waitByKind.internal)} you control (internal) ·{' '}
                {formatDuration(waitByKind.external)} outside your control (external)
                {waitByKind.unspecified > 0 &&
                  ` · ${formatDuration(waitByKind.unspecified)} uncategorized`}
              </span>
            )}
          </div>

          <ol className="wait-panel__list">
            {contributors.map((c, i) => (
              <li key={c.edge_id} className="wait-panel__row" onClick={() => onSelectEdge(c.edge_id)}>
                <span className="wait-panel__rank">{i + 1}</span>
                <div className="wait-panel__row-main">
                  <div className="wait-panel__row-path">
                    {c.source_step_name} <span className="wait-panel__arrow">→</span>{' '}
                    {c.target_step_name}
                    {c.wait_kind && (
                      <span className={`wait-panel__kind-badge wait-panel__kind-badge--${c.wait_kind}`}>
                        {c.wait_kind}
                      </span>
                    )}
                  </div>
                  {c.label ? (
                    <div className="wait-panel__row-label">{c.label}</div>
                  ) : (
                    <div className="wait-panel__row-label wait-panel__row-label--missing">
                      no label — what's this wait for?
                    </div>
                  )}
                  {c.slip_amplification && (
                    <div className="wait-panel__slip-badge">
                      ⚠ slip risk — gates {formatDuration(c.slip_amplification.protects_wait_sec)}
                      {c.slip_amplification.protects_label
                        ? ` (${c.slip_amplification.protects_label})`
                        : ''}
                    </div>
                  )}
                </div>
                <div className="wait-panel__row-duration">{formatDuration(c.wait_time_sec)}</div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
