import { useEffect, useState } from 'react'
import type { Edge, MapMetrics, WaitKind } from '../api/types'
import { useDeleteEdge, useUpdateEdge } from '../api/hooks'
import { formatDuration } from '../lib/duration'
import DurationInput from './DurationInput'
import './EdgeDrawer.css'

interface EdgeDrawerProps {
  mapId: string
  edge: Edge
  sourceStepName: string
  targetStepName: string
  metrics?: MapMetrics
  onClose: () => void
  /** false on a read-only (featured/published) map: read mode only, no "Edit" affordance —
   * the backend would 403 the write anyway. Defaults true. */
  editable?: boolean
}

const KIND_LABEL: Record<'internal' | 'external', string> = {
  internal: 'Internal — your org controls it (approvals, holds)',
  external: 'External — outside your control (vendor, shipping)',
}

export default function EdgeDrawer({
  mapId,
  edge,
  sourceStepName,
  targetStepName,
  metrics,
  onClose,
  editable = true,
}: EdgeDrawerProps) {
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [kind, setKind] = useState(edge.kind === 'rework' ? 'rework' : 'flow')
  const [waitSec, setWaitSec] = useState(edge.wait_time_sec)
  const [label, setLabel] = useState(edge.label ?? '')
  const [waitKind, setWaitKind] = useState<WaitKind>(edge.wait_kind)
  const [reworkRate, setReworkRate] = useState<number | null>(edge.rework_rate)

  const updateEdge = useUpdateEdge(mapId)
  const deleteEdge = useDeleteEdge(mapId)

  const title = `${sourceStepName} → ${targetStepName}`
  const wc = metrics?.wait_contributors.find((w) => w.edge_id === edge.id)
  const onCritical = metrics?.critical_edge_ids.includes(edge.id) ?? false
  const slip = wc?.slip_amplification ?? null
  const loop = metrics?.rework_loops.find((r) => r.edge_id === edge.id) ?? null

  // Only on switching to a different connector — see StepDrawer for why the post-save reset is
  // handled explicitly instead.
  useEffect(() => {
    setKind(edge.kind === 'rework' ? 'rework' : 'flow')
    setWaitSec(edge.wait_time_sec)
    setLabel(edge.label ?? '')
    setWaitKind(edge.wait_kind)
    setReworkRate(edge.rework_rate)
    setMode('read')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge.id])

  const dirty =
    kind !== (edge.kind === 'rework' ? 'rework' : 'flow') ||
    waitSec !== edge.wait_time_sec ||
    label !== (edge.label ?? '') ||
    waitKind !== edge.wait_kind ||
    reworkRate !== edge.rework_rate

  function handleSave() {
    updateEdge.mutate(
      {
        edgeId: edge.id,
        data: {
          kind,
          wait_time_sec: kind === 'rework' ? 0 : waitSec,
          label: label.trim() || null,
          wait_kind: kind === 'rework' ? null : waitKind,
          rework_rate: kind === 'rework' ? reworkRate : null,
        },
      },
      {
        onSuccess: (updated) => {
          setKind(updated.kind === 'rework' ? 'rework' : 'flow')
          setWaitSec(updated.wait_time_sec)
          setLabel(updated.label ?? '')
          setWaitKind(updated.wait_kind)
          setReworkRate(updated.rework_rate)
          setMode('read')
        },
      },
    )
  }

  function handleDelete() {
    if (!confirm(`Delete this connector (${title})?`)) return
    deleteEdge.mutate(edge.id, { onSuccess: onClose })
  }

  // ── Read mode ──────────────────────────────────────────────────────────────
  if (mode === 'read') {
    return (
      <aside className="edge-drawer">
        <div className="edge-drawer__header">
          <div className="edge-drawer__title">
            {sourceStepName} <span className="edge-drawer__arrow">→</span> {targetStepName}
          </div>
          <button className="edge-drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <dl className="edge-drawer__facts">
          {edge.kind === 'rework' ? (
            <>
              <div className="edge-drawer__fact">
                <dt>Connector type</dt>
                <dd>Rework loop — a defect caught at {sourceStepName} sends work back to {targetStepName}</dd>
              </div>
              <div className="edge-drawer__fact">
                <dt>Escape rate</dt>
                <dd>
                  {loop
                    ? `${loop.rate_pct.toFixed(0)}% of units hit this loop`
                    : edge.rework_rate != null
                      ? `${edge.rework_rate.toFixed(0)}%`
                      : 'set the origin step’s %C&A, or a rate here'}
                </dd>
              </div>
              {loop && (
                <div className="edge-drawer__fact">
                  <dt>Cost when it fires</dt>
                  <dd>
                    re-runs a {formatDuration(loop.loop_cost_sec)} segment ·{' '}
                    <strong>~{formatDuration(loop.expected_extra_sec)}</strong> of expected lead
                    time
                  </dd>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="edge-drawer__fact">
                <dt>Wait time</dt>
                <dd>{formatDuration(edge.wait_time_sec)}</dd>
              </div>
              <div className="edge-drawer__fact">
                <dt>Who controls it</dt>
                <dd>{edge.wait_kind ? KIND_LABEL[edge.wait_kind] : 'Not categorized yet'}</dd>
              </div>
              {edge.label && (
                <div className="edge-drawer__fact">
                  <dt>Label</dt>
                  <dd>{edge.label}</dd>
                </div>
              )}
              {metrics && (
                <div className="edge-drawer__fact edge-drawer__fact--status">
                  <dd>
                    {onCritical ? 'On the critical path.' : 'Off the critical path — it has slack.'}
                  </dd>
                </div>
              )}
              {slip && (
                <div className="edge-drawer__slip">
                  ⚠ Slip risk — a short delay here can miss the{' '}
                  {formatDuration(slip.protects_wait_sec)} window it gates
                  {slip.protects_label || slip.protects_target_step_name
                    ? ` (${slip.protects_label || slip.protects_target_step_name})`
                    : ''}
                  .
                </div>
              )}
            </>
          )}
        </dl>

        {editable && (
          <div className="edge-drawer__actions">
            <button className="edge-drawer__edit-btn" onClick={() => setMode('edit')}>
              ✎ Edit
            </button>
          </div>
        )}
      </aside>
    )
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  return (
    <aside className="edge-drawer">
      <div className="edge-drawer__header">
        <div className="edge-drawer__title">
          {sourceStepName} <span className="edge-drawer__arrow">→</span> {targetStepName}
        </div>
        <button className="edge-drawer__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="edge-drawer__field">
        <span className="edge-drawer__field-label">Connector type</span>
        <div className="edge-drawer__kind-toggle">
          <button
            className={`edge-drawer__kind-btn${kind === 'flow' ? ' edge-drawer__kind-btn--active-internal' : ''}`}
            onClick={() => setKind('flow')}
          >
            Flow
          </button>
          <button
            className={`edge-drawer__kind-btn${kind === 'rework' ? ' edge-drawer__kind-btn--active-external' : ''}`}
            onClick={() => setKind('rework')}
          >
            Rework loop
          </button>
        </div>
        {kind === 'rework' && (
          <p className="edge-drawer__hint">
            A defect caught at <strong>{sourceStepName}</strong> sends work back to{' '}
            <strong>{targetStepName}</strong> to be redone. It never touches the critical-path
            math — but its expected cost is charged against lead time.
          </p>
        )}
      </div>

      {kind === 'flow' ? (
        <>
          <div className="edge-drawer__section">
            <DurationInput label="Wait time" seconds={waitSec} onChange={setWaitSec} />
            <p className="edge-drawer__hint">
              Queue, transport, or approval delay between these two steps — real elapsed time
              with no work happening. This is the connector's weight in the lead-time /
              critical-path math.
            </p>
          </div>

          <div className="edge-drawer__field">
            <span className="edge-drawer__field-label">Who controls this wait?</span>
            <div className="edge-drawer__kind-toggle">
              <button
                className={`edge-drawer__kind-btn${waitKind === 'internal' ? ' edge-drawer__kind-btn--active-internal' : ''}`}
                onClick={() => setWaitKind(waitKind === 'internal' ? null : 'internal')}
              >
                Internal
              </button>
              <button
                className={`edge-drawer__kind-btn${waitKind === 'external' ? ' edge-drawer__kind-btn--active-external' : ''}`}
                onClick={() => setWaitKind(waitKind === 'external' ? null : 'external')}
              >
                External
              </button>
            </div>
            <p className="edge-drawer__hint">
              Internal: your org controls it (approvals, sign-offs, QA holds) — act on it this
              week. External: outside your control (vendor lead time, shipping) — pad a buffer
              instead.
            </p>
          </div>
        </>
      ) : (
        <div className="edge-drawer__field">
          <span className="edge-drawer__field-label">Escape rate (optional)</span>
          <div className="edge-drawer__rework-rate">
            <input
              className="edge-drawer__label-input"
              type="number"
              min={0}
              max={100}
              placeholder="from origin %C&A"
              value={reworkRate ?? ''}
              onChange={(e) =>
                setReworkRate(e.target.value === '' ? null : Number(e.target.value))
              }
            />
            <span>%</span>
          </div>
          <p className="edge-drawer__hint">
            The fraction of units that hit this loop. Leave blank to derive it from{' '}
            <strong>{targetStepName}</strong>'s %C&amp;A (1&nbsp;−&nbsp;%C&amp;A).
          </p>
        </div>
      )}

      <label className="edge-drawer__field">
        <span className="edge-drawer__field-label">Label (optional)</span>
        <input
          className="edge-drawer__label-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. truck 2x/week, CCB approval"
        />
      </label>

      <div className="edge-drawer__footer">
        <button className="edge-drawer__delete-btn" onClick={handleDelete}>
          Delete
        </button>
        <div className="edge-drawer__footer-right">
          <button
            className="edge-drawer__cancel-btn"
            onClick={() => {
              setWaitSec(edge.wait_time_sec)
              setLabel(edge.label ?? '')
              setWaitKind(edge.wait_kind)
              setMode('read')
            }}
          >
            Cancel
          </button>
          <button
            className="edge-drawer__save-btn"
            onClick={handleSave}
            disabled={!dirty || updateEdge.isPending}
          >
            {updateEdge.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    </aside>
  )
}
