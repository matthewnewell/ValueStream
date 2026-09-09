import { useEffect, useState } from 'react'
import type { Edge, MapMetrics, WaitKind } from '../api/types'
import { useDeleteEdge, useUpdateEdge } from '../api/hooks'
import { formatDuration } from '../lib/duration'
import { getAuthor, setAuthor } from '../lib/journal'
import DurationInput from './DurationInput'
import Journal from './Journal'
import './EdgeDrawer.css'

interface EdgeDrawerProps {
  mapId: string
  edge: Edge
  sourceStepName: string
  targetStepName: string
  metrics?: MapMetrics
  onClose: () => void
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
}: EdgeDrawerProps) {
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [waitSec, setWaitSec] = useState(edge.wait_time_sec)
  const [label, setLabel] = useState(edge.label ?? '')
  const [waitKind, setWaitKind] = useState<WaitKind>(edge.wait_kind)
  const [why, setWhy] = useState('')
  const [name, setName] = useState(getAuthor())

  const updateEdge = useUpdateEdge(mapId)
  const deleteEdge = useDeleteEdge(mapId)

  const title = `${sourceStepName} → ${targetStepName}`
  const wc = metrics?.wait_contributors.find((w) => w.edge_id === edge.id)
  const onCritical = metrics?.critical_edge_ids.includes(edge.id) ?? false
  const slip = wc?.slip_amplification ?? null

  // Only on switching to a different connector — see StepDrawer for why the post-save reset is
  // handled explicitly instead.
  useEffect(() => {
    setWaitSec(edge.wait_time_sec)
    setLabel(edge.label ?? '')
    setWaitKind(edge.wait_kind)
    setWhy('')
    setMode('read')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge.id])

  const dirty =
    waitSec !== edge.wait_time_sec || label !== (edge.label ?? '') || waitKind !== edge.wait_kind

  function handleSave() {
    if (name.trim() && name.trim() !== getAuthor()) setAuthor(name)
    updateEdge.mutate(
      {
        edgeId: edge.id,
        data: {
          wait_time_sec: waitSec,
          label: label.trim() || null,
          wait_kind: waitKind,
          author: (name.trim() || getAuthor()) || undefined,
          journal_note: why.trim() || undefined,
        },
      },
      {
        onSuccess: (updated) => {
          setWaitSec(updated.wait_time_sec)
          setLabel(updated.label ?? '')
          setWaitKind(updated.wait_kind)
          setWhy('')
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
              <dd>{onCritical ? 'On the critical path.' : 'Off the critical path — it has slack.'}</dd>
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
        </dl>

        <div className="edge-drawer__actions">
          <button className="edge-drawer__edit-btn" onClick={() => setMode('edit')}>
            ✎ Edit
          </button>
        </div>

        <div className="edge-drawer__journal">
          <Journal
            mapId={mapId}
            target={{ type: 'edge', id: edge.id, name: title }}
            editable
            compact
          />
        </div>
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

      <div className="edge-drawer__section">
        <DurationInput label="Wait time" seconds={waitSec} onChange={setWaitSec} />
        <p className="edge-drawer__hint">
          Queue, transport, or approval delay between these two steps — real elapsed time with
          no work happening. This is the connector's weight in the lead-time / critical-path
          math.
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
          Internal: your org controls it (approvals, sign-offs, QA holds) — act on it this week.
          External: outside your control (vendor lead time, shipping) — pad a buffer instead.
        </p>
      </div>

      <label className="edge-drawer__field">
        <span className="edge-drawer__field-label">Label (optional)</span>
        <input
          className="edge-drawer__label-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. truck 2x/week, CCB approval"
        />
      </label>

      <div className="edge-drawer__why">
        <span className="edge-drawer__field-label">
          Why this change?{' '}
          <span className="edge-drawer__why-hint">optional — goes in the journal</span>
        </span>
        <textarea
          rows={2}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="e.g. foundry pushed the batch a week"
        />
        {!getAuthor() && (
          <input
            className="edge-drawer__label-input"
            placeholder="your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </div>

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
              setWhy('')
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
