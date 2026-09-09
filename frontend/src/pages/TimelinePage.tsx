import type { KeyboardEvent } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useExpandStep,
  useMap,
  useMapMetrics,
  usePublishMap,
  useResetSample,
} from '../api/hooks'
import type { MapMetrics, Step, WaitKind } from '../api/types'
import EdgeDrawer from '../components/EdgeDrawer'
import InfoPopover from '../components/InfoPopover'
import MapToolbar from '../components/MapToolbar'
import StepDrawer from '../components/StepDrawer'
import VsmTimeline from '../components/VsmTimeline'
import { formatDuration } from '../lib/duration'
import './TimelinePage.css'

type FocusType = 'slip' | 'rework' | 'delay' | 'bottleneck' | 'wait'

interface FocusItem {
  key: string
  type: FocusType
  title: string
  detail: string
  hint: string
  /** Seconds of impact on the outcome — drives the sort. A wait with slack contributes 0
   * (shortening it doesn't move the date); a slip risk contributes the window it protects. */
  impactSec: number
  waitKind?: WaitKind
  hasSlack?: boolean
  /** Where a click on the row goes: drill into a nested map, or open a drawer for this
   * edge / step of the current map. */
  drillMapId?: string | null
  edgeId?: string
  stepId?: string
}

const TAG_LABEL: Record<FocusType, string> = {
  slip: 'Slip risk',
  rework: 'Rework risk',
  delay: 'Dominant delay',
  bottleneck: 'Bottleneck',
  wait: 'Wait',
}

// Tiebreak when two items have equal impact: protect a gated window before chasing the wait
// it gates; a rework loop (whole-segment redo) outranks a single wait.
const TYPE_ORDER: Record<FocusType, number> = {
  slip: 0,
  rework: 1,
  delay: 2,
  wait: 3,
  bottleneck: 4,
}

/** Where to focus — impact-first, not "easiest first". Every item carries an `impactSec`
 * (how much it drives the delivery date); the list sorts by that. Anything with slack —
 * shortening it moves nothing — is split off into a collapsed group rather than mixed in. */
function buildFocusList(metrics: MapMetrics): { primary: FocusItem[]; minor: FocusItem[] } {
  const items: FocusItem[] = []
  const waits = metrics.wait_contributors // engine sorts these worst-first
  const critEdges = new Set(metrics.critical_edge_ids)
  const domId = waits.find((w) => critEdges.has(w.edge_id) && !w.slip_amplification)?.edge_id

  for (const w of waits) {
    const onCrit = critEdges.has(w.edge_id)
    const slip = w.slip_amplification
    const label = w.label ? ` · ${w.label}` : ''

    if (slip) {
      const gated = slip.protects_label || slip.protects_target_step_name
      items.push({
        key: `slip-${w.edge_id}`,
        type: 'slip',
        edgeId: w.edge_id,
        impactSec: slip.protects_wait_sec,
        waitKind: w.wait_kind,
        title: `${w.source_step_name} → ${w.target_step_name}`,
        detail: `${formatDuration(w.wait_time_sec)}${label} · gates a ${formatDuration(slip.protects_wait_sec)} window`,
        hint: `Protect this date — a slip here can miss the ${formatDuration(slip.protects_wait_sec)}${gated ? ` "${gated}"` : ''} window it gates, costing the whole downstream cycle, not just the days lost here.`,
      })
      continue
    }

    items.push({
      key: `wait-${w.edge_id}`,
      type: w.edge_id === domId ? 'delay' : 'wait',
      edgeId: w.edge_id,
      impactSec: onCrit ? w.wait_time_sec : 0,
      hasSlack: !onCrit,
      waitKind: w.wait_kind,
      title: `${w.source_step_name} → ${w.target_step_name}`,
      detail: `${formatDuration(w.wait_time_sec)}${label}`,
      hint: !onCrit
        ? 'Off the critical path — it has slack, so shortening it will not move the delivery date. Worth watching, not spending on.'
        : w.wait_kind === 'external'
          ? 'Outside your day-to-day control, but not fixed — pay to expedite, dual-source it, or order earlier and hold a buffer. It is on the critical path, so money spent shrinking it buys lead time directly.'
          : w.wait_kind === 'internal'
            ? 'You control this. Before making it faster, ask whether the step or sign-off is load-bearing at all — deleting beats optimizing.'
            : 'Categorize this wait as internal or external so you know whether you can act on it.',
    })
  }

  for (const r of metrics.rework_loops) {
    items.push({
      key: `rework-${r.edge_id}`,
      type: 'rework',
      edgeId: r.edge_id,
      impactSec: r.expected_extra_sec,
      title: `${r.detection_step_name} → rework back to ${r.origin_step_name}`,
      detail: `${r.rate_pct.toFixed(0)}% of units hit this · each one re-runs the ${formatDuration(
        r.loop_cost_sec,
      )} segment from ${r.origin_step_name} · ~${formatDuration(
        r.expected_extra_sec,
      )} of expected lead time`,
      hint: `Catch it earlier. This loop only fires because a defect clears every check between ${r.origin_step_name} and ${r.detection_step_name} — a review or gate that stops half of them buys back ~${formatDuration(
        r.expected_extra_sec / 2,
      )}, usually cheaper than any downstream expedite. Front-loading quality is the highest-leverage spend on a loop like this.`,
    })
  }

  const db = metrics.deepest_bottleneck
  if (db) {
    const nested = db.breadcrumb.length > 1
    const inside = nested
      ? db.breadcrumb.slice(0, -1).map((h) => h.step_name).join(' › ')
      : null
    items.push({
      key: `bottleneck-${db.step_id}`,
      type: 'bottleneck',
      drillMapId: nested ? db.breadcrumb[db.breadcrumb.length - 1].map_id : null,
      stepId: nested ? undefined : db.step_id,
      impactSec: db.on_critical_path ? db.processing_time_sec : 0,
      hasSlack: !db.on_critical_path,
      title: db.name + (inside ? `  (inside ${inside})` : ''),
      detail: `${formatDuration(db.processing_time_sec)} of work${db.on_critical_path ? '' : ' · off the critical path'}`,
      hint:
        'The busiest single step — it caps throughput (units per period), not this one delivery. Add capacity here only if you run this process repeatedly.' +
        (db.on_critical_path ? '' : ' It is not on the path setting the date either.'),
    })
  }

  const byImpact = (a: FocusItem, b: FocusItem) =>
    b.impactSec - a.impactSec || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]

  return {
    primary: items.filter((i) => !i.hasSlack).sort(byImpact),
    minor: items.filter((i) => i.hasSlack).sort(byImpact),
  }
}

export default function TimelinePage() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { data: map, isLoading: mapLoading } = useMap(mapId)
  const { data: metrics, isLoading: metricsLoading } = useMapMetrics(mapId)
  const publishMap = usePublishMap(mapId ?? '')
  const resetSample = useResetSample()
  const expandStep = useExpandStep(mapId ?? '')

  // Which timeline element is open in the drawer. Only one of the two is ever set.
  const [selStepId, setSelStepId] = useState<string | null>(null)
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null)
  const [showMinor, setShowMinor] = useState(false)
  useEffect(() => {
    setSelStepId(null)
    setSelEdgeId(null)
    setShowMinor(false)
  }, [mapId])

  // The Journal view links back here as /maps/:id/timeline?open=<step or edge id> — resolve it,
  // open that drawer, then drop the param so a refresh doesn't keep re-opening it.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const open = searchParams.get('open')
    if (!open || !map) return
    if (map.steps.some((s) => s.id === open)) {
      setSelEdgeId(null)
      setSelStepId(open)
    } else if (map.edges.some((e) => e.id === open)) {
      setSelStepId(null)
      setSelEdgeId(open)
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, map, setSearchParams])

  if (!mapId) return null
  if (mapLoading || metricsLoading || !map || !metrics) {
    return <div className="tv-page__loading">Loading…</div>
  }

  const editable = !map.read_only
  const stepsById = new Map(map.steps.map((s) => [s.id, s]))
  const selectedStep = selStepId ? map.steps.find((s) => s.id === selStepId) ?? null : null
  const selectedEdge = selEdgeId ? map.edges.find((e) => e.id === selEdgeId) ?? null : null

  const openStep = (id: string) => {
    setSelEdgeId(null)
    setSelStepId(id)
  }
  const openEdge = (id: string) => {
    setSelStepId(null)
    setSelEdgeId(id)
  }

  // Publishing is the "closeout -> library" step described on the splash page: a finished
  // project's map, with its real recorded numbers, becomes the next project's starting point
  // instead of a zero scaffold. It's a copy, never a move — this working map stays exactly
  // as-is. Publishing again overwrites the prior snapshot.
  function handlePublish() {
    if (!map) return
    const blankSteps = map.steps.filter(
      (s) => !s.child_map_id && s.human_time_sec + s.machine_time_sec === 0,
    )
    if (blankSteps.length > 0) {
      const ok = window.confirm(
        `${blankSteps.length} step${blankSteps.length === 1 ? ' has' : 's have'} no recorded ` +
          'time yet. A published map is meant to carry real numbers forward — publish anyway?',
      )
      if (!ok) return
    }
    const category = window.prompt(
      'Publish this finished map to the Map Library so other projects can clone it. This ' +
        'working map stays exactly as-is — publishing creates a copy.\n\nLibrary category ' +
        '(optional), e.g. "Hardware Fabrication":',
    )
    if (category === null) return // cancelled
    publishMap.mutate(
      { template_category: category.trim() || undefined },
      { onSuccess: () => navigate('/library') },
    )
  }

  // The sample map is an editable sandbox — Reset wipes every change (and any sub-processes
  // expanded off it) back to the seeded state. The rebuilt map has a new id, so land on /sample
  // to re-resolve it.
  function handleReset() {
    if (!window.confirm('Reset the sample map? This discards every change and restores the original.')) {
      return
    }
    resetSample.mutate(undefined, { onSuccess: () => navigate('/sample') })
  }

  // The drawer's "Open / Expand sub-process" action: navigate straight in if the step already
  // owns one, otherwise create it on the fly (same as the Node view's expand).
  function handleExpand(step: Step) {
    if (step.child_map_id) {
      navigate(`/maps/${step.child_map_id}/timeline`)
      return
    }
    expandStep.mutate(step.id, {
      onSuccess: (child) => navigate(`/maps/${child.id}/timeline`),
    })
  }

  const focus = buildFocusList(metrics)
  const wbk = metrics.wait_by_kind_sec
  const pce = metrics.process_cycle_efficiency_pct

  function renderFocusRow(it: FocusItem) {
    const act = it.drillMapId
      ? () => navigate(`/maps/${it.drillMapId}/timeline`)
      : editable && it.edgeId
        ? () => openEdge(it.edgeId!)
        : editable && it.stepId
          ? () => openStep(it.stepId!)
          : undefined
    const isSel =
      (it.edgeId && it.edgeId === selEdgeId) || (it.stepId && it.stepId === selStepId)
    return (
      <li
        key={it.key}
        className={
          'tv-focus__row' +
          (act ? ' tv-focus__row--click' : '') +
          (isSel ? ' tv-focus__row--selected' : '')
        }
        {...(act
          ? {
              role: 'button',
              tabIndex: 0,
              onClick: act,
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  act()
                }
              },
            }
          : {})}
      >
        <span className={`tv-tag tv-tag--${it.type}`}>{TAG_LABEL[it.type]}</span>
        <div className="tv-focus__body">
          <div className="tv-focus__title">
            {it.title}
            {it.waitKind && <span className={`tv-kind tv-kind--${it.waitKind}`}>{it.waitKind}</span>}
          </div>
          <div className="tv-focus__detail">{it.detail}</div>
          <div className="tv-focus__hint">{it.hint}</div>
        </div>
        {it.drillMapId && <span className="tv-focus__chev">⤵</span>}
      </li>
    )
  }

  return (
    <div className="tv-page">
      <MapToolbar
        mapId={mapId}
        mapName={map.name}
        view="timeline"
        readOnly={map.read_only}
        onReset={map.lifecycle === 'sample' ? handleReset : undefined}
        actions={
          map.lifecycle === 'working' && (
            <button onClick={handlePublish} disabled={publishMap.isPending}>
              📚 Publish to Library
            </button>
          )
        }
      />

      <div className="tv-page__row">
        <div className="tv-page__content">
          <VsmTimeline
            map={map}
            metrics={metrics}
            onSelectStep={editable ? openStep : undefined}
            onSelectEdge={editable ? openEdge : undefined}
            selectedId={selStepId ?? selEdgeId}
          />

          <section className="tv-stats">
            <div className="tv-stat">
              <div className="tv-stat__label">
                Lead time
                <InfoPopover label="Lead time">
                  Total elapsed time along the critical path — from the first step starting to the
                  last one finishing, <strong>work and every wait in between</strong>. The calendar
                  time a unit actually takes, not the hours booked to it.
                </InfoPopover>
              </div>
              <div className="tv-stat__value">{formatDuration(metrics.lead_time_sec)}</div>
              <div className="tv-stat__note">
                {metrics.expected_lead_time_sec > metrics.lead_time_sec + 1 ? (
                  <>
                    ~{formatDuration(metrics.expected_lead_time_sec)} once rework is expected ·{' '}
                  </>
                ) : null}
                {formatDuration(metrics.total_processing_time_sec)} is actual work
              </div>
            </div>

            {metrics.rolled_pct_ca != null && (
              <div className="tv-stat">
                <div className="tv-stat__label">
                  Rolled %C&amp;A
                  <InfoPopover label="Rolled percent complete and accurate">
                    Each step's <strong>Percent Complete &amp; Accurate</strong> — how much of what
                    it hands downstream is usable as-is — compounded along the critical path.
                    0.9&nbsp;×&nbsp;0.9&nbsp;×&nbsp;0.9&nbsp;≈&nbsp;73%: every handoff loses a
                    little. Low here means the real cost isn't the steps, it's the rework between
                    them.
                  </InfoPopover>
                </div>
                <div className="tv-stat__value">{metrics.rolled_pct_ca.toFixed(0)}%</div>
                <div className="tv-stat__note">
                  {metrics.ca_assessed_count} step{metrics.ca_assessed_count === 1 ? '' : 's'}{' '}
                  assessed
                </div>
              </div>
            )}

            <div className="tv-stat">
              <div className="tv-stat__label">
                Process cycle efficiency
                <InfoPopover label="Process cycle efficiency">
                  <strong>Value-add work ÷ lead time.</strong> The share of the calendar that is
                  real work rather than waiting. Under ~25% means the process is mostly queue —
                  the fastest wins are in the gaps, not the steps.
                </InfoPopover>
              </div>
              <div className="tv-stat__value">{pce.toFixed(1)}%</div>
              <div className="tv-stat__note">
                {pce < 25
                  ? 'Most of the lead time is waiting, not working.'
                  : pce < 60
                    ? 'A meaningful share of lead time is still wait, not work.'
                    : 'Most of the lead time is real work — the seams are under control.'}
              </div>
            </div>
          </section>

          <section className="tv-section">
            <div className="tv-section__head">
              <h2 className="tv-section__title">Where to focus</h2>
              <InfoPopover label="the focus list">
                Ranked by impact on the delivery date — the biggest lever first, not the easiest
                fix. Anything with slack (shortening it moves nothing) is set aside below.
                <br />
                <br />
                <strong>Slip risk</strong> — a short window that gates a much longer one. Missing
                it forfeits the whole downstream cycle, so it ranks by what it protects, not its
                own length.
                <br />
                <br />
                <strong>Dominant delay</strong> — the single biggest wait on the critical path.
                The largest lever on this delivery's date.
                <br />
                <br />
                <strong>Bottleneck</strong> — the busiest single step. Caps throughput (units per
                period), not this one date — usually a lower priority for one-off project work.
                <br />
                <br />
                <strong>Wait</strong> — the remaining critical-path gaps, biggest first.
              </InfoPopover>
            </div>

            {focus.primary.length === 0 && focus.minor.length === 0 ? (
              <p className="tv-section__body">
                No waits or bottleneck recorded yet — this map is all work, no gaps.
              </p>
            ) : (
              <>
                {(wbk.internal > 0 || wbk.external > 0 || wbk.unspecified > 0) && (
                  <p className="tv-focus__split">
                    <strong>{formatDuration(wbk.internal)}</strong> of the total wait is inside your
                    control · <strong>{formatDuration(wbk.external)}</strong> is outside it
                    {wbk.unspecified > 0 && (
                      <> · {formatDuration(wbk.unspecified)} not yet categorized</>
                    )}
                  </p>
                )}

                {focus.primary.length > 0 ? (
                  <ol className="tv-focus">{focus.primary.map(renderFocusRow)}</ol>
                ) : (
                  <p className="tv-section__body">
                    Nothing on the critical path to attack — every wait here has slack.
                  </p>
                )}

                {focus.minor.length > 0 && (
                  <>
                    <button
                      className="tv-focus__more"
                      onClick={() => setShowMinor((v) => !v)}
                      aria-expanded={showMinor}
                    >
                      {showMinor ? '▾' : '▸'} {focus.minor.length} more with slack —{' '}
                      {showMinor ? 'hide' : 'show'}
                    </button>
                    {showMinor && (
                      <ol className="tv-focus tv-focus--minor">{focus.minor.map(renderFocusRow)}</ol>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>

        {selectedStep && (
          <StepDrawer
            mapId={mapId}
            step={selectedStep}
            metric={metrics.step_metrics[selectedStep.id]}
            onClose={() => setSelStepId(null)}
            onExpand={() => handleExpand(selectedStep)}
          />
        )}
        {selectedEdge && (
          <EdgeDrawer
            mapId={mapId}
            edge={selectedEdge}
            metrics={metrics}
            sourceStepName={stepsById.get(selectedEdge.source_step_id)?.name ?? '?'}
            targetStepName={stepsById.get(selectedEdge.target_step_id)?.name ?? '?'}
            onClose={() => setSelEdgeId(null)}
          />
        )}
      </div>
    </div>
  )
}
