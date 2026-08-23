import { useEffect, useState } from 'react'
import type { Step } from '../api/types'
import { useAiSuggestStep, useDeleteStep, useUpdateStep } from '../api/hooks'
import DurationInput from './DurationInput'
import './StepDrawer.css'

interface StepDrawerProps {
  mapId: string
  step: Step
  onClose: () => void
}

interface FormState {
  name: string
  description: string
  human_time_sec: number
  machine_time_sec: number
  operators: number
  machines: number
  notes: string
}

function toForm(step: Step): FormState {
  return {
    name: step.name,
    description: step.description ?? '',
    human_time_sec: step.human_time_sec,
    machine_time_sec: step.machine_time_sec,
    operators: step.operators,
    machines: step.machines,
    notes: step.notes ?? '',
  }
}

export default function StepDrawer({ mapId, step, onClose }: StepDrawerProps) {
  const [form, setForm] = useState<FormState>(() => toForm(step))
  const [aiRationale, setAiRationale] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  const updateStep = useUpdateStep(mapId)
  const deleteStep = useDeleteStep(mapId)
  const aiSuggest = useAiSuggestStep()

  // Explicit Save, not autosave-on-type: deliberate, to avoid a race between the operator
  // typing and an AI suggestion resolving into the same fields mid-edit. Reset the form
  // whenever the operator switches to a different step (or the step is refetched post-save).
  useEffect(() => {
    setForm(toForm(step))
    setAiRationale(null)
    setAiError(null)
  }, [step.id, step.human_time_sec, step.machine_time_sec, step.operators, step.machines, step.name, step.description, step.notes])

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(step))

  function handleSave() {
    updateStep.mutate({
      stepId: step.id,
      data: {
        name: form.name.trim() || step.name,
        description: form.description || null,
        human_time_sec: form.human_time_sec,
        machine_time_sec: form.machine_time_sec,
        operators: form.operators,
        machines: form.machines,
        notes: form.notes || null,
      },
    })
  }

  function handleDelete() {
    if (!confirm(`Delete "${step.name}"? This also removes any connectors touching it.`)) return
    deleteStep.mutate(step.id, { onSuccess: onClose })
  }

  function handleAiSuggest() {
    setAiError(null)
    aiSuggest.mutate(step.id, {
      onSuccess: (result) => {
        if (result.error) {
          setAiError(result.error)
          return
        }
        setForm((f) => ({
          ...f,
          human_time_sec: result.human_time_sec ?? f.human_time_sec,
          machine_time_sec: result.machine_time_sec ?? f.machine_time_sec,
          operators: result.operators ?? f.operators,
          machines: result.machines ?? f.machines,
        }))
        setAiRationale(result.rationale ?? null)
      },
      onError: (err) => setAiError(err instanceof Error ? err.message : 'AI suggestion failed'),
    })
  }

  const processingTime = form.human_time_sec + form.machine_time_sec

  return (
    <aside className="step-drawer">
      <div className="step-drawer__header">
        <input
          className="step-drawer__name-input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <button className="step-drawer__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <textarea
        className="step-drawer__description"
        placeholder="Describe this step (used as context for AI suggestions)…"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        rows={2}
      />

      <div className="step-drawer__section">
        <div className="step-drawer__section-header">
          <span>Processing time</span>
          <button
            className="step-drawer__ai-btn"
            onClick={handleAiSuggest}
            disabled={aiSuggest.isPending}
          >
            {aiSuggest.isPending ? 'Thinking…' : '✨ AI Suggest'}
          </button>
        </div>

        {aiError && <div className="step-drawer__ai-error">{aiError}</div>}
        {aiRationale && (
          <div className="step-drawer__ai-rationale">
            <strong>AI suggestion applied (not yet saved):</strong> {aiRationale}
          </div>
        )}

        <div className="step-drawer__row">
          <DurationInput
            label="Human"
            seconds={form.human_time_sec}
            onChange={(s) => setForm((f) => ({ ...f, human_time_sec: s }))}
          />
          <DurationInput
            label="Machine"
            seconds={form.machine_time_sec}
            onChange={(s) => setForm((f) => ({ ...f, machine_time_sec: s }))}
          />
        </div>
        <div className="step-drawer__total">
          Total processing time: <strong>{formatTotal(processingTime)}</strong>
        </div>
      </div>

      <div className="step-drawer__section">
        <div className="step-drawer__section-header">
          <span>Resources</span>
        </div>
        <div className="step-drawer__row">
          <label className="step-drawer__number">
            <span>Operators</span>
            <input
              type="number"
              min={0}
              value={form.operators}
              onChange={(e) => setForm((f) => ({ ...f, operators: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="step-drawer__number">
            <span>Machines</span>
            <input
              type="number"
              min={0}
              value={form.machines}
              onChange={(e) => setForm((f) => ({ ...f, machines: Number(e.target.value) || 0 }))}
            />
          </label>
        </div>
      </div>

      <div className="step-drawer__section">
        <div className="step-drawer__section-header">
          <span>Notes</span>
        </div>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          placeholder="Operator notes…"
        />
      </div>

      <div className="step-drawer__footer">
        <button className="step-drawer__delete-btn" onClick={handleDelete}>
          Delete step
        </button>
        <button
          className="step-drawer__save-btn"
          onClick={handleSave}
          disabled={!dirty || updateStep.isPending}
        >
          {updateStep.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>
    </aside>
  )
}

function formatTotal(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}min`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}hr`
  return `${(seconds / 86400).toFixed(1)}days`
}
