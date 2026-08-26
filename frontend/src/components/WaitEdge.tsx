import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react'
import type { Edge as ApiEdge } from '../api/types'
import { formatDurationCompact } from '../lib/duration'
import './WaitEdge.css'

export type WaitEdgeData = {
  edge: ApiEdge
  isCritical: boolean
}

export type WaitEdgeType = Edge<WaitEdgeData, 'wait'>

export default function WaitEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps<WaitEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const wait = data?.edge.wait_time_sec ?? 0
  const isCritical = data?.isCritical ?? false

  // Thicker stroke for longer waits, within a readable range.
  const strokeWidth = Math.min(6, 1.5 + Math.log10(Math.max(1, wait)) * 0.8)

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? strokeWidth + 1.5 : strokeWidth,
          stroke: selected
            ? 'var(--color-accent)'
            : isCritical
              ? 'var(--color-wait)'
              : 'var(--color-border-strong)',
          opacity: selected ? 1 : isCritical ? 0.9 : 0.7,
        }}
      />
      {/* A fresh connector has 0 wait time and would otherwise be an unlabeled, easy-to-miss
          thin line — show the chip once selected even at 0 so clicking it always confirms
          it's clickable/editable, not just once a nonzero value has already been set. */}
      {(wait > 0 || selected) && (
        <EdgeLabelRenderer>
          <div
            className={`wait-edge__label${isCritical ? ' wait-edge__label--critical' : ''}${selected ? ' wait-edge__label--selected' : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {wait > 0 ? `⏳ ${formatDurationCompact(wait)}` : 'click to set wait time'}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
