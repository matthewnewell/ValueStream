import { useEffect, useState } from 'react'
import type { Edge, WaitKind } from '../api/types'
import { useDeleteEdge, useUpdateEdge } from '../api/hooks'
import { getAuthor, setAuthor } from '../lib/journal'
import DurationInput from './DurationInput'
import Journal from './Journal'
import './EdgeDrawer.css'

interface EdgeDrawerProps {
  mapId: string
  edge: Edge
  sourceStepName: string
  targetStepName: string
  onClose: () => void
}

export default function EdgeDrawer({ mapId, edge, sourceStepName, targetStepName, onClose }: EdgeDrawerProps) {
  const [waitSec, setWaitSec] = useState(edge.wait_time_sec)
  const [label, setLabel] = useState(edge.label ?? '')
  const [waitKind, setWaitKind] = useState<WaitKind>(edge.wait_kind)
  const [why, setWhy] = useState('')
  const [name, setName] = useState(getAuthor())

  const updateEdge = useUpdateEdge(mapId)
  const deleteEdge = useDeleteEdge(mapId)

  // Same explicit-Save pattern as StepDrawer, for the same reason: no surprises from
  // autosave-on-type while the operator is still mid-edit.
  useEffect(() => {
    setWaitSec(edge.wait_time_sec)
    setLabel(edge.label ?? '')
    setWaitKind(edge.wait_kind)
    setWhy('')
  }, [edge.id, edge.wait_time_sec, edge.label, edge.wait_kind])

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
      { onSuccess: () => setWhy('') },
    )
  }

  function handleDelete() {
    if (!confirm(`Delete this connector (${sourceStepName} → ${targetStepName})?`)) return
    deleteEdge.mutate(edge.id, { onSuccess: onClose })
  }

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
          Queue, transport, or approval delay between these two steps — the real elapsed time
          that passes with no work happening. This is what the lead-time / critical-path
          calculation uses as this connector's weight.
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
          Internal: your org controls it (approvals, sign-offs, QA holds) — you can act on it
          this week. External: outside your control (vendor lead time, shipping) — pad a
          buffer instead.
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

      {dirty && (
        <div className="edge-drawer__why">
          <span className="edge-drawer__field-label">
            Why this change? <span className="edge-drawer__why-hint">optional — goes in the journal</span>
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
      )}

      <div className="edge-drawer__footer">
        <button className="edge-drawer__delete-btn" onClick={handleDelete}>
          Delete connector
        </button>
        <button
          className="edge-drawer__save-btn"
          onClick={handleSave}
          disabled={!dirty || updateEdge.isPending}
        >
          {updateEdge.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div className="edge-drawer__journal">
        <Journal
          mapId={mapId}
          target={{ type: 'edge', id: edge.id, name: `${sourceStepName} → ${targetStepName}` }}
          editable
          compact
        />
      </div>
    </aside>
  )
}
