import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MapDetail, MapMetrics } from '../api/types'
import { formatDuration, formatDurationCompact } from '../lib/duration'
import './VsmTimeline.css'

interface VsmTimelineProps {
  map: MapDetail
  metrics: MapMetrics
  /** Click a work box / off-path step to open its drawer. When omitted, a box that owns a
   * sub-process still drills into it on click (read-only maps). */
  onSelectStep?: (stepId: string) => void
  /** Click a wait bar / off-path wait to open its connector drawer. */
  onSelectEdge?: (edgeId: string) => void
  /** The step or edge currently open in a drawer — gets a selected outline. */
  selectedId?: string | null
}

// SVG geometry. The coordinate system tracks the measured container width, so the viewBox
// scales ~1:1 (text stays a constant size) while the whole figure widens and narrows with the
// container — the chat panel opening/closing, the window resizing — like the cards below it.
// Segment widths are proportional to duration; a tiny step is floored to a readable minimum
// and the one big segment (usually the dominant wait) takes the slack.
const PAD = 12
const MIN_TRACK_W = 420
const MIN_WORK_W = 76
const MIN_WAIT_W = 42
const WORK_Y = 6
const WORK_H = 58
const WAIT_Y = 40
const WAIT_H = 26
// The muted lane below the critical timeline — off-critical-path steps/waits (they have slack),
// laid out in flow order starting from where the branch leaves the critical path. Only drawn
// when there's off-path work.
const OFF_Y = WAIT_Y + WAIT_H + 14
const OFF_H = 22
const MIN_OFF_WORK_W = 118
const MIN_OFF_WAIT_W = 46

type WorkSeg = {
  kind: 'work'
  id: string
  name: string
  sec: number
  childMapId: string | null
  childCount: number | null
}
type WaitSeg = { kind: 'wait'; id: string; label: string | null; sec: number }
type Placed<T> = T & { x: number; w: number }
type OffItem = { kind: 'work' | 'wait'; id: string; label: string; sec: number; x: number; w: number }

/** The critical path drawn to scale: value-add steps as rounded accent boxes, the waits
 * between them as dashed amber bars dropped just below — the same visual grammar Rother &
 * Shook's VSM uses (and the same figure the splash page leads with). Off-critical-path work
 * (parallel branches, which have slack) shows in a muted lane beneath, placed at roughly when
 * it runs — enough to answer "what else is going on" without the full graph.
 *
 * A box for a step that owns a sub-process is clickable: it drills into that child map's
 * Timeline view, the same "arriving at a map lands on its summary" rule the Node view uses. */
export default function VsmTimeline({
  map,
  metrics,
  onSelectStep,
  onSelectEdge,
  selectedId,
}: VsmTimelineProps) {
  const navigate = useNavigate()

  // Track the outer container's width so the coordinate system matches it (viewBox ~1:1, text
  // a constant size) while the figure widens/narrows with the column — the chat panel toggling,
  // the window resizing. The container is `width: 100%` and nothing inside can push it wider
  // (the SVG is `width: 100%` too), so this is a clean one-way measurement.
  const rootRef = useRef<HTMLDivElement>(null)
  const [availW, setAvailW] = useState(760)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => setAvailW((prev) => (el.clientWidth ? el.clientWidth : prev))
    measure()
    // A CSS-driven resize (the chat panel opening) doesn't re-render this tree, so a
    // ResizeObserver is what actually catches it; the window listener is a fallback.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const stepsById = new Map(map.steps.map((s) => [s.id, s]))
  const edgesById = new Map(map.edges.map((e) => [e.id, e]))
  const pathSteps = metrics.critical_path_step_ids
  const pathEdges = metrics.critical_path_edge_ids

  if (pathSteps.length === 0) {
    return (
      <div className="vsm-timeline vsm-timeline--empty">
        Add steps and connect them to see the timeline.
      </div>
    )
  }

  // Interleave critical work steps with the waits that follow them (skipping zero waits).
  const raw: (WorkSeg | WaitSeg)[] = []
  pathSteps.forEach((stepId, i) => {
    const sm = metrics.step_metrics[stepId]
    raw.push({
      kind: 'work',
      id: stepId,
      name: stepsById.get(stepId)?.name ?? '—',
      sec: sm?.effective_processing_sec ?? 0,
      childMapId: sm?.child_map_id ?? null,
      childCount: sm?.child_step_count ?? null,
    })
    const edge = pathEdges[i] ? edgesById.get(pathEdges[i]) : undefined
    if (edge && edge.wait_time_sec > 0) {
      raw.push({ kind: 'wait', id: edge.id, label: edge.label, sec: edge.wait_time_sec })
    }
  })

  const totalSec = raw.reduce((a, s) => a + s.sec, 0) || 1
  const minOf = (s: WorkSeg | WaitSeg) => (s.kind === 'work' ? MIN_WORK_W : MIN_WAIT_W)
  const contentW = Math.max(availW - PAD * 2, MIN_TRACK_W)

  // Two-pass fill: any segment whose proportional share is below its readable minimum is
  // pinned to that minimum; the rest share the leftover width by their duration. The track
  // then fills `contentW` exactly (or overflows and scrolls if the minimums alone don't fit).
  const pinned = raw.map((s) => (s.sec / totalSec) * contentW < minOf(s))
  const pinnedPx = raw.reduce((a, s, i) => a + (pinned[i] ? minOf(s) : 0), 0)
  const flexSec = raw.reduce((a, s, i) => a + (pinned[i] ? 0 : s.sec), 0) || 1
  const flexPx = Math.max(contentW - pinnedPx, 0)

  let cursor = PAD
  const segs: (Placed<WorkSeg> | Placed<WaitSeg>)[] = raw.map((s, i) => {
    const w = pinned[i] ? minOf(s) : Math.max((s.sec / flexSec) * flexPx, minOf(s))
    const placed = { ...s, x: cursor, w }
    cursor += w
    return placed
  })
  const trackEnd = cursor

  // Piecewise-linear time -> x along the critical timeline, so off-path work can be placed by
  // its CPM earliest-start / earliest-finish.
  const breaks: { t: number; x: number }[] = [{ t: 0, x: PAD }]
  let acc = 0
  for (const s of segs) {
    acc += s.sec
    breaks.push({ t: acc, x: s.x + s.w })
  }
  const timeToX = (t: number): number => {
    if (t <= 0) return breaks[0].x
    for (let i = 1; i < breaks.length; i++) {
      if (t <= breaks[i].t) {
        const a = breaks[i - 1]
        const b = breaks[i]
        const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
        return a.x + f * (b.x - a.x)
      }
    }
    return breaks[breaks.length - 1].x
  }

  const critSteps = new Set(metrics.critical_step_ids)
  const critEdges = new Set(metrics.critical_edge_ids)
  const disconnected = new Set(metrics.disconnected_step_ids)

  // Gather off-path steps + waits, then order them by CPM earliest-start so they read as the
  // branch's own flow.
  const rawOff: { kind: 'work' | 'wait'; id: string; label: string; sec: number; startSec: number }[] = []
  for (const st of map.steps) {
    const sm = metrics.step_metrics[st.id]
    if (!sm || critSteps.has(st.id) || disconnected.has(st.id)) continue
    if (sm.earliest_start_sec == null) continue
    rawOff.push({ kind: 'work', id: st.id, label: st.name, sec: sm.effective_processing_sec, startSec: sm.earliest_start_sec })
  }
  for (const e of map.edges) {
    if (critEdges.has(e.id) || e.wait_time_sec <= 0) continue
    const src = metrics.step_metrics[e.source_step_id]
    if (!src || src.earliest_finish_sec == null) continue
    rawOff.push({ kind: 'wait', id: e.id, label: e.label ?? 'wait', sec: e.wait_time_sec, startSec: src.earliest_finish_sec })
  }
  rawOff.sort((a, b) => a.startSec - b.startSec || (a.kind === b.kind ? 0 : a.kind === 'work' ? -1 : 1))

  // Lay them out sequentially from where the branch first diverges, wide enough to read.
  let offCursor = rawOff.length ? timeToX(rawOff[0].startSec) : PAD
  const offItems: OffItem[] = rawOff.map((it) => {
    const w = it.kind === 'work' ? MIN_OFF_WORK_W : MIN_OFF_WAIT_W
    const x = Math.max(timeToX(it.startSec), offCursor)
    offCursor = x + w + 3
    return { kind: it.kind, id: it.id, label: it.label, sec: it.sec, x, w }
  })
  const hasOff = offItems.length > 0
  const offEnd = hasOff ? offItems[offItems.length - 1].x + offItems[offItems.length - 1].w : 0

  const svgW = Math.max(trackEnd, offEnd) + PAD
  const svgH = hasOff ? OFF_Y + OFF_H + 4 : WAIT_Y + WAIT_H + 6
  const hasDrill = segs.some((s) => s.kind === 'work' && s.childMapId)

  return (
    <div className="vsm-timeline" ref={rootRef}>
      <div className="vsm-timeline__scroll">
        <svg
          className="vsm-timeline__svg"
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMinYMid meet"
          role="img"
          aria-label="The critical path drawn to scale — value-add steps and the waits between them"
        >
          {segs.map((seg) => {
            if (seg.kind === 'work') {
              const click = onSelectStep
                ? () => onSelectStep(seg.id)
                : seg.childMapId
                  ? () => navigate(`/maps/${seg.childMapId}/timeline`)
                  : undefined
              return (
                <g
                  key={seg.id}
                  className={
                    'vsm-tl__work' +
                    (click ? ' vsm-tl__work--clickable' : '') +
                    (seg.id === selectedId ? ' vsm-tl__work--selected' : '')
                  }
                  onClick={click}
                >
                  <title>
                    {seg.name} — {formatDuration(seg.sec)} of value-add work
                    {onSelectStep
                      ? ' · click for details'
                      : seg.childMapId
                        ? ` · click to open its ${seg.childCount}-step sub-process`
                        : ''}
                  </title>
                  <rect
                    className="vsm-tl__work-rect"
                    x={seg.x}
                    y={WORK_Y}
                    width={seg.w}
                    height={WORK_H}
                    rx="7"
                  />
                  <text className="vsm-tl__work-name" x={seg.x + seg.w / 2} y={WORK_Y + 25} textAnchor="middle">
                    {clip(seg.name, seg.w)}
                  </text>
                  <text className="vsm-tl__work-dur" x={seg.x + seg.w / 2} y={WORK_Y + 40} textAnchor="middle">
                    {formatDurationCompact(seg.sec)}
                  </text>
                  {seg.childMapId && (
                    <g
                      className="vsm-tl__drill-hit"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/maps/${seg.childMapId}/timeline`)
                      }}
                    >
                      <title>Open its {seg.childCount}-step sub-process</title>
                      <rect x={seg.x + seg.w - 34} y={WORK_Y} width={34} height={16} fill="transparent" />
                      <text className="vsm-tl__work-drill" x={seg.x + seg.w - 6} y={WORK_Y + 13} textAnchor="end">
                        ⤵ {seg.childCount}
                      </text>
                    </g>
                  )}
                </g>
              )
            }
            const click = onSelectEdge ? () => onSelectEdge(seg.id) : undefined
            return (
              <g
                key={seg.id}
                className={
                  'vsm-tl__wait' +
                  (click ? ' vsm-tl__wait--clickable' : '') +
                  (seg.id === selectedId ? ' vsm-tl__wait--selected' : '')
                }
                onClick={click}
              >
                <title>
                  Wait: {formatDuration(seg.sec)}
                  {seg.label ? ` — ${seg.label}` : ' — unlabeled'}
                  {onSelectEdge ? ' · click for details' : ''}
                </title>
                <rect
                  className="vsm-tl__wait-rect"
                  x={seg.x}
                  y={WAIT_Y}
                  width={seg.w}
                  height={WAIT_H}
                />
                <text className="vsm-tl__wait-text" x={seg.x + seg.w / 2} y={WAIT_Y + 16} textAnchor="middle">
                  {formatDurationCompact(seg.sec)}
                </text>
              </g>
            )
          })}

          {hasOff &&
            offItems.map((it) => {
              const click =
                it.kind === 'work'
                  ? onSelectStep
                    ? () => onSelectStep(it.id)
                    : undefined
                  : onSelectEdge
                    ? () => onSelectEdge(it.id)
                    : undefined
              const cls =
                'vsm-tl__off' +
                (click ? ' vsm-tl__off--clickable' : '') +
                (it.id === selectedId ? ' vsm-tl__off--selected' : '')
              return it.kind === 'work' ? (
                <g key={it.id} className={cls} onClick={click}>
                  <title>
                    {it.label} — {formatDuration(it.sec)} · off the critical path, has slack
                  </title>
                  <rect className="vsm-tl__off-work" x={it.x} y={OFF_Y} width={it.w} height={OFF_H} rx="4" />
                  <text className="vsm-tl__off-text" x={it.x + it.w / 2} y={OFF_Y + 14} textAnchor="middle">
                    {clip(it.label, it.w)}
                  </text>
                </g>
              ) : (
                <g key={it.id} className={cls} onClick={click}>
                  <title>
                    Wait: {formatDuration(it.sec)}
                    {it.label && it.label !== 'wait' ? ` — ${it.label}` : ''} · off the critical
                    path, has slack
                  </title>
                  <rect className="vsm-tl__off-wait" x={it.x} y={OFF_Y + 4} width={it.w} height={OFF_H - 8} />
                  <text className="vsm-tl__off-text" x={it.x + it.w / 2} y={OFF_Y + 14} textAnchor="middle">
                    {formatDurationCompact(it.sec)}
                  </text>
                </g>
              )
            })}
        </svg>
      </div>

      <div className="vsm-timeline__legend">
        <span className="vsm-timeline__legend-item">
          <span className="vsm-timeline__legend-swatch vsm-timeline__legend-swatch--work" />
          Work
        </span>
        <span className="vsm-timeline__legend-item">
          <span className="vsm-timeline__legend-swatch vsm-timeline__legend-swatch--wait" />
          Wait
        </span>
        {hasOff && (
          <span className="vsm-timeline__legend-item">
            <span className="vsm-timeline__legend-swatch vsm-timeline__legend-swatch--off" />
            Off critical path (has slack)
          </span>
        )}
        {hasDrill && (
          <span className="vsm-timeline__legend-item vsm-timeline__legend-item--hint">
            ⤵ has a sub-process
          </span>
        )}
      </div>
    </div>
  )
}

/** SVG <text> has no ellipsis — trim to what fits `w` px at the label font (~6px/char). */
function clip(text: string, w: number): string {
  const max = Math.max(3, Math.floor((w - 8) / 6))
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
