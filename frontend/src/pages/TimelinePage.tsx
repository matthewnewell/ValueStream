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

type AttackType = 'slip' | 'delay' | 'bottleneck' | 'wait'

interface AttackItem {
  key: string
  type: AttackType
  title: string
  detail: string
  hint: string
  waitKind?: WaitKind
  hasSlack?: boolean
  /** Where a click on the row goes: drill into a nested map, or open a drawer for this
   * edge / step of the current map. */
  drillMapId?: string | null
  edgeId?: string
  stepId?: string
}

const TAG_LABEL: Record<AttackType, string> = {
  slip: 'Slip risk',
  delay: 'Dominant delay',
  bottleneck: 'Bottleneck',
  wait: 'Wait',
}

/** Ranked list of the things worth a PM's attention, most actionable first:
 *  1. slip risks  — a short window that gates a much longer one; miss it, lose the whole cycle
 *  2. dominant delay — the single biggest wait driving this delivery's date
 *  3. capacity bottleneck — the busiest step; caps throughput, not this date
 *  4. every other wait, largest first (off-critical-path ones flagged "has slack") */
function buildAttackList(metrics: MapMetrics): AttackItem[] {
  const items: AttackItem[] = []
  const waits = metrics.wait_contributors
  const critEdges = new Set(metrics.critical_edge_ids)
  const shown = new Set<string>()

  for (const w of waits) {
    if (!w.slip_amplification) continue
    shown.add(w.edge_id)
    const gated =
      w.slip_amplification.protects_label || w.slip_amplification.protects_target_step_name
    items.push({
      key: `slip-${w.edge_id}`,
      type: 'slip',
      edgeId: w.edge_id,
      title: `${w.source_step_name} → ${w.target_step_name}`,
      detail: `${formatDuration(w.wait_time_sec)}${w.label ? ` · ${w.label}` : ''}`,
      waitKind: w.wait_kind,
      hint: `Protect this date. A slip here can miss the ${formatDuration(
        w.slip_amplification.protects_wait_sec,
      )}${gated ? ` "${gated}"` : ''} window it gates — and cost the whole downstream cycle, not just the days lost here.`,
    })
  }

  const dom = waits[0]
  if (dom && !shown.has(dom.edge_id)) {
    shown.add(dom.edge_id)
    items.push({
      key: `delay-${dom.edge_id}`,
      type: 'delay',
      edgeId: dom.edge_id,
      title: `${dom.source_step_name} → ${dom.target_step_name}`,
      detail: `${formatDuration(dom.wait_time_sec)}${dom.label ? ` · ${dom.label}` : ''}`,
      waitKind: dom.wait_kind,
      hasSlack: !critEdges.has(dom.edge_id),
      hint:
        dom.wait_kind === 'external'
          ? 'Outside your control — buffer around it, or qualify a second/faster source before the next program needs it.'
          : dom.wait_kind === 'internal'
            ? 'You control this. Before making it faster, ask whether the step or sign-off is load-bearing at all — deleting beats optimizing.'
            : 'Categorize this wait as internal or external so you know whether you can act on it directly.',
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
      title: db.name + (inside ? `  (inside ${inside})` : ''),
      detail: `${formatDuration(db.processing_time_sec)} of work${
        db.on_critical_path ? '' : ' · not on the critical path'
      }`,
      hint:
        'The busiest single step — it caps throughput (how many you can run per month), not this delivery date. Add capacity here only if you run this process repeatedly.' +
        (db.on_critical_path
          ? ''
          : ' It is not even on the path setting your date, so it is not the reason this one is late.'),
    })
  }

  for (const w of waits) {
    if (shown.has(w.edge_id)) continue
    items.push({
      key: `wait-${w.edge_id}`,
      type: 'wait',
      edgeId: w.edge_id,
      title: `${w.source_step_name} → ${w.target_step_name}`,
      detail: `${formatDuration(w.wait_time_sec)}${w.label ? ` · ${w.label}` : ''}`,
      waitKind: w.wait_kind,
      hasSlack: !critEdges.has(w.edge_id),
      hint:
        w.wait_kind === 'internal'
          ? 'Internal — a candidate to shorten or remove.'
          : w.wait_kind === 'external'
            ? 'External — track it; add buffer if it sits on the critical path.'
            : 'Not yet categorized as internal or external.',
    })
  }

  return items
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
  useEffect(() => {
    setSelStepId(null)
    setSelEdgeId(null)
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

  const attack = buildAttackList(metrics)
  const wbk = metrics.wait_by_kind_sec
  const pce = metrics.process_cycle_efficiency_pct

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
                {formatDuration(metrics.total_processing_time_sec)} of that is actual work
              </div>
            </div>
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
              <h2 className="tv-section__title">What to attack</h2>
              <InfoPopover label="the attack list">
                Ranked most-actionable first.
                <br />
                <br />
                <strong>Slip risk</strong> — a short wait right before a much longer one on the
                critical path. Missing the short window can forfeit the whole long cycle, so it is
                worth more attention than its own length.
                <br />
                <br />
                <strong>Dominant delay</strong> — the single biggest wait. The largest lever on
                this delivery's date.
                <br />
                <br />
                <strong>Bottleneck</strong> — the busiest single step. Caps throughput (units per
                month), not this one date.
                <br />
                <br />
                <strong>Wait</strong> — every other gap, largest first. "Has slack" means it is off
                the critical path, so shortening it will not move the date.
              </InfoPopover>
            </div>

            {attack.length === 0 ? (
              <p className="tv-section__body">
                No waits or bottleneck recorded yet — this map is all work, no gaps.
              </p>
            ) : (
              <>
                {(wbk.internal > 0 || wbk.external > 0 || wbk.unspecified > 0) && (
                  <p className="tv-attack__split">
                    <strong>{formatDuration(wbk.internal)}</strong> of the total wait is inside your
                    control · <strong>{formatDuration(wbk.external)}</strong> is outside it
                    {wbk.unspecified > 0 && (
                      <> · {formatDuration(wbk.unspecified)} not yet categorized</>
                    )}
                  </p>
                )}

                <ol className="tv-attack">
                  {attack.map((it) => {
                    const act = it.drillMapId
                      ? () => navigate(`/maps/${it.drillMapId}/timeline`)
                      : editable && it.edgeId
                        ? () => openEdge(it.edgeId!)
                        : editable && it.stepId
                          ? () => openStep(it.stepId!)
                          : undefined
                    const isSel =
                      (it.edgeId && it.edgeId === selEdgeId) ||
                      (it.stepId && it.stepId === selStepId)
                    return (
                      <li
                        key={it.key}
                        className={
                          'tv-attack__row' +
                          (act ? ' tv-attack__row--click' : '') +
                          (isSel ? ' tv-attack__row--selected' : '')
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
                        <div className="tv-attack__body">
                          <div className="tv-attack__title">
                            {it.title}
                            {it.waitKind && (
                              <span className={`tv-kind tv-kind--${it.waitKind}`}>
                                {it.waitKind}
                              </span>
                            )}
                            {it.hasSlack && <span className="tv-kind tv-kind--slack">has slack</span>}
                          </div>
                          <div className="tv-attack__detail">{it.detail}</div>
                          <div className="tv-attack__hint">{it.hint}</div>
                        </div>
                        {it.drillMapId && <span className="tv-attack__chev">⤵</span>}
                      </li>
                    )
                  })}
                </ol>
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
