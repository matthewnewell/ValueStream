import { useEffect, useState } from 'react'
import type { Step, StepMetric } from '../api/types'
import { useCollapseStep, useDeleteStep, useUpdateStep } from '../api/hooks'
import { formatDuration } from '../lib/duration'
import { getAuthor, setAuthor } from '../lib/journal'
import DurationInput from './DurationInput'
import Journal from './Journal'
import './StepDrawer.css'

interface StepDrawerProps {
  mapId: string
  step: Step
  metric: StepMetric | undefined
  onClose: () => void
  /** Open (or create-then-open) this step's sub-process map. */
  onExpand: () => void
  /** false on a read-only (featured/published) map: read mode only, no "Edit" affordance and
   * no journal composer — the backend would 403 the write anyway. Defaults true. */
  editable?: boolean
}

interface FormState {
  name: string
  description: string
  owning_team: string
  human_time_sec: number
  machine_time_sec: number
  operators: number
  machines: number
  pct_complete_accurate: number | null
}

function toForm(step: Step): FormState {
  return {
    name: step.name,
    description: step.description ?? '',
    owning_team: step.owning_team ?? '',
    human_time_sec: step.human_time_sec,
    machine_time_sec: step.machine_time_sec,
    operators: step.operators,
    machines: step.machines,
    pct_complete_accurate: step.pct_complete_accurate,
  }
}

function critLine(m: StepMetric | undefined): string | null {
  if (!m || typeof m.is_critical !== 'boolean') return null
  if (m.is_critical) return 'On the critical path — time here moves the finish date.'
  if (m.slack_sec && m.slack_sec > 0) {
    return `Off the critical path — ${formatDuration(m.slack_sec)} of slack.`
  }
  return 'Off the critical path.'
}

export default function StepDrawer({
  mapId,
  step,
  metric,
  onClose,
  onExpand,
  editable = true,
}: StepDrawerProps) {
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [form, setForm] = useState<FormState>(() => toForm(step))
  const [why, setWhy] = useState('')
  const [name, setName] = useState(getAuthor())

  const updateStep = useUpdateStep(mapId)
  const deleteStep = useDeleteStep(mapId)
  const collapseStep = useCollapseStep(mapId)

  const hasChildMap = !!step.child_map_id

  // Only on switching to a different step — not on every background refetch, so an in-progress
  // edit is never silently reset. The post-save reset is handled explicitly in handleSave.
  useEffect(() => {
    setForm(toForm(step))
    setWhy('')
    setMode('read')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(step))

  function handleSave() {
    if (name.trim() && name.trim() !== getAuthor()) setAuthor(name)
    updateStep.mutate(
      {
        stepId: step.id,
        data: {
          name: form.name.trim() || step.name,
          description: form.description || null,
          owning_team: form.owning_team.trim() || null,
          human_time_sec: form.human_time_sec,
          machine_time_sec: form.machine_time_sec,
          operators: form.operators,
          machines: form.machines,
          pct_complete_accurate: form.pct_complete_accurate,
          author: (name.trim() || getAuthor()) || undefined,
          journal_note: why.trim() || undefined,
        },
      },
      {
        onSuccess: (updated) => {
          setForm(toForm(updated))
          setWhy('')
          setMode('read')
        },
      },
    )
  }

  function handleDelete() {
    if (!confirm(`Delete "${step.name}"? This also removes any connectors touching it.`)) return
    deleteStep.mutate(step.id, { onSuccess: onClose })
  }

  function handleCollapse() {
    if (
      !confirm(
        `Collapse "${step.name}"? This permanently deletes its entire sub-process (${metric?.child_step_count ?? '?'} steps) — not just the link to it.`,
      )
    )
      return
    collapseStep.mutate(step.id)
  }

  // ── Read mode ──────────────────────────────────────────────────────────────
  if (mode === 'read') {
    const proc = step.human_time_sec + step.machine_time_sec
    const both = step.human_time_sec > 0 && step.machine_time_sec > 0
    const crit = critLine(metric)
    const resources = [
      `${step.operators} operator${step.operators === 1 ? '' : 's'}`,
      step.machines > 0 ? `${step.machines} machine${step.machines === 1 ? '' : 's'}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <aside className="step-drawer">
        <div className="step-drawer__header">
          <h2 className="step-drawer__title">{step.name}</h2>
          <button className="step-drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {step.description ? (
          <p className="step-drawer__desc-text">{step.description}</p>
        ) : (
          <p className="step-drawer__desc-text step-drawer__desc-text--empty">No description</p>
        )}

        <dl className="step-drawer__facts">
          <div className="step-drawer__fact">
            <dt>Owned by</dt>
            <dd>
              {step.owning_team ? (
                step.owning_team
              ) : (
                <span className="step-drawer__fact-sub">unassigned</span>
              )}
            </dd>
          </div>
          {hasChildMap ? (
            <>
              <div className="step-drawer__fact">
                <dt>Rolled-up total</dt>
                <dd>{formatDuration(metric?.effective_processing_sec)}</dd>
              </div>
              <div className="step-drawer__fact">
                <dt>From</dt>
                <dd>
                  a {metric?.child_step_count ?? '?'}-step sub-process ·{' '}
                  <button className="step-drawer__linklike" onClick={onExpand}>
                    open →
                  </button>
                </dd>
              </div>
            </>
          ) : (
            <>
              <div className="step-drawer__fact">
                <dt>Processing time</dt>
                <dd>
                  {formatDuration(proc)}
                  {both && (
                    <span className="step-drawer__fact-sub">
                      {' '}
                      · {formatDuration(step.human_time_sec)} human +{' '}
                      {formatDuration(step.machine_time_sec)} machine
                    </span>
                  )}
                </dd>
              </div>
              <div className="step-drawer__fact">
                <dt>Resources</dt>
                <dd>{resources}</dd>
              </div>
            </>
          )}
          <div className="step-drawer__fact">
            <dt>%C&amp;A</dt>
            <dd>
              {step.pct_complete_accurate != null ? (
                `${step.pct_complete_accurate.toFixed(0)}% complete & accurate`
              ) : (
                <span className="step-drawer__fact-sub">not assessed</span>
              )}
            </dd>
          </div>
          {crit && (
            <div
              className={`step-drawer__fact step-drawer__fact--status${metric?.is_critical ? ' step-drawer__fact--critical' : ''}`}
            >
              <dd>{crit}</dd>
            </div>
          )}
        </dl>

        {editable && (
          <div className="step-drawer__actions">
            <button className="step-drawer__edit-btn" onClick={() => setMode('edit')}>
              ✎ Edit
            </button>
          </div>
        )}

        <div className="step-drawer__section step-drawer__journal">
          <Journal
            mapId={mapId}
            target={{ type: 'step', id: step.id, name: step.name }}
            editable={editable}
            compact
          />
        </div>
      </aside>
    )
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  return (
    <aside className="step-drawer">
      <div className="step-drawer__header">
        <div className="step-drawer__name-field">
          <label className="step-drawer__field-label" htmlFor="step-drawer-name">
            Name
          </label>
          <input
            id="step-drawer-name"
            className="step-drawer__name-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <button className="step-drawer__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="step-drawer__field">
        <label className="step-drawer__field-label" htmlFor="step-drawer-description">
          Description
        </label>
        <textarea
          id="step-drawer-description"
          className="step-drawer__description"
          placeholder="Describe this step…"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
        />
      </div>

      <div className="step-drawer__field">
        <label className="step-drawer__field-label" htmlFor="step-drawer-owner">
          Owning team
        </label>
        <input
          id="step-drawer-owner"
          className="step-drawer__owner-input"
          placeholder="e.g. Systems Engineering"
          value={form.owning_team}
          onChange={(e) => setForm((f) => ({ ...f, owning_team: e.target.value }))}
        />
      </div>

      {hasChildMap ? (
        <div className="step-drawer__section">
          <div className="step-drawer__section-header">
            <span>Processing time</span>
          </div>
          <div className="step-drawer__rollup-note">
            Expanded into a {metric?.child_step_count ?? '?'}-step sub-process — these numbers roll
            up from it, not editable here.
          </div>
          <div className="step-drawer__rollup">
            <div className="step-drawer__rollup-row">
              <span>👤 Human</span>
              <strong>{formatDuration(metric?.effective_human_sec)}</strong>
            </div>
            <div className="step-drawer__rollup-row">
              <span>⚙️ Machine</span>
              <strong>{formatDuration(metric?.effective_machine_sec)}</strong>
            </div>
            <div className="step-drawer__rollup-row">
              <span>⏳ Wait (inside sub-process)</span>
              <strong>{formatDuration(metric?.effective_wait_sec)}</strong>
            </div>
            <div className="step-drawer__rollup-row step-drawer__rollup-row--total">
              <span>Total</span>
              <strong>{formatDuration(metric?.effective_processing_sec)}</strong>
            </div>
          </div>
          <div className="step-drawer__row">
            <button className="step-drawer__open-btn" onClick={onExpand}>
              Open sub-process →
            </button>
            <button className="step-drawer__collapse-btn" onClick={handleCollapse}>
              Collapse
            </button>
          </div>
        </div>
      ) : (
        <div className="step-drawer__section">
          <div className="step-drawer__section-header">
            <span>Processing time</span>
          </div>
          <div className="step-drawer__stack">
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
            Total: <strong>{formatDuration(form.human_time_sec + form.machine_time_sec)}</strong>
          </div>
          <button className="step-drawer__expand-btn" onClick={onExpand}>
            ⤵ Expand into sub-process
          </button>
        </div>
      )}

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
          <span>%C&amp;A</span>
        </div>
        <label className="step-drawer__number step-drawer__ca">
          <span>Percent complete &amp; accurate</span>
          <div className="step-drawer__ca-row">
            <input
              type="number"
              min={0}
              max={100}
              placeholder="not assessed"
              value={form.pct_complete_accurate ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  pct_complete_accurate:
                    e.target.value === '' ? null : Number(e.target.value),
                }))
              }
            />
            <span className="step-drawer__ca-pct">%</span>
          </div>
          <span className="step-drawer__ca-hint">
            Of what this step hands downstream, how much is right the first time — no
            clarification, correction, or missing pieces.
          </span>
        </label>
      </div>

      <div className="step-drawer__why">
        <label className="step-drawer__field-label">
          Why this change? <span>optional — goes in the journal</span>
        </label>
        <textarea
          rows={2}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="e.g. added a second shift to hit the ship date"
        />
        {!getAuthor() && (
          <input
            className="step-drawer__why-name"
            placeholder="your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </div>

      <div className="step-drawer__footer">
        <button className="step-drawer__delete-btn" onClick={handleDelete}>
          Delete
        </button>
        <div className="step-drawer__footer-right">
          <button
            className="step-drawer__cancel-btn"
            onClick={() => {
              setForm(toForm(step))
              setWhy('')
              setMode('read')
            }}
          >
            Cancel
          </button>
          <button
            className="step-drawer__save-btn"
            onClick={handleSave}
            disabled={!dirty || updateStep.isPending}
          >
            {updateStep.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    </aside>
  )
}
