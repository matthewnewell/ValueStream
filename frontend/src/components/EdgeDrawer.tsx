import { useEffect, useState } from 'react'
import type { Edge } from '../api/types'
import { useDeleteEdge, useUpdateEdge } from '../api/hooks'
import DurationInput from './DurationInput'
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

  const updateEdge = useUpdateEdge(mapId)
  const deleteEdge = useDeleteEdge(mapId)

  // Same explicit-Save pattern as StepDrawer, for the same reason: no surprises from
  // autosave-on-type while the operator is still mid-edit.
  useEffect(() => {
    setWaitSec(edge.wait_time_sec)
    setLabel(edge.label ?? '')
  }, [edge.id, edge.wait_time_sec, edge.label])

  const dirty = waitSec !== edge.wait_time_sec || label !== (edge.label ?? '')

  function handleSave() {
    updateEdge.mutate({ edgeId: edge.id, data: { wait_time_sec: waitSec, label: label.trim() || null } })
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
    </aside>
  )
}
