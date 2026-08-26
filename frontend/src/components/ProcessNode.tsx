import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { Step, StepMetric } from '../api/types'
import { formatDurationCompact } from '../lib/duration'
import './ProcessNode.css'

export type ProcessNodeData = {
  step: Step
  metric: StepMetric | undefined
  isBottleneck: boolean
  isDisconnected: boolean
  /** Navigate into (or create + navigate into) this step's sub-process. */
  onExpand: (stepId: string) => void
}

export type ProcessNodeType = Node<ProcessNodeData, 'process'>

export default function ProcessNode({ data, selected }: NodeProps<ProcessNodeType>) {
  const { step, metric, isBottleneck, isDisconnected, onExpand } = data

  // Never read step.human_time_sec/machine_time_sec directly once a step might have a child
  // map — those raw fields go stale/irrelevant the moment it's expanded. `metric`'s
  // effective_* fields are always the right number (own time for a leaf, rolled-up child-map
  // total once expanded), computed server-side, same principle as everywhere else in the app.
  const humanSec = metric?.effective_human_sec ?? step.human_time_sec
  const machineSec = metric?.effective_machine_sec ?? step.machine_time_sec
  const waitSec = metric?.effective_wait_sec ?? 0
  const isCritical = metric?.is_critical ?? false
  const pctOfLeadTime = metric?.pct_of_lead_time ?? 0
  const hasChildMap = metric?.has_child_map ?? !!step.child_map_id

  const classes = ['process-node']
  if (isCritical) classes.push('process-node--critical')
  if (isBottleneck) classes.push('process-node--bottleneck')
  if (isDisconnected) classes.push('process-node--disconnected')
  if (selected) classes.push('process-node--selected')
  if (hasChildMap) classes.push('process-node--expandable')

  return (
    <div className={classes.join(' ')} onDoubleClick={() => onExpand(step.id)}>
      <Handle type="target" position={Position.Left} />

      {isBottleneck && <div className="process-node__flag" title="Throughput bottleneck">🔥</div>}

      {hasChildMap && (
        <button
          className="process-node__expand-badge"
          title={`Open sub-process (${metric?.child_step_count ?? '?'} steps)`}
          onClick={(e) => {
            e.stopPropagation()
            onExpand(step.id)
          }}
        >
          ⤵ {metric?.child_step_count ?? ''}
        </button>
      )}

      <div className="process-node__name">{step.name}</div>

      {pctOfLeadTime > 0 && (
        <div className="process-node__bar-track">
          <div
            className="process-node__bar-fill"
            style={{ width: `${Math.min(100, pctOfLeadTime)}%` }}
          />
        </div>
      )}

      <div className="process-node__databox">
        <div className="process-node__stat">
          <span className="process-node__stat-label">👤</span>
          <span>{formatDurationCompact(humanSec)}</span>
        </div>
        <div className="process-node__stat">
          <span className="process-node__stat-label">⚙️</span>
          <span>{formatDurationCompact(machineSec)}</span>
        </div>
        {hasChildMap ? (
          <div className="process-node__stat" title="Wait time rolled up from inside the sub-process">
            <span className="process-node__stat-label">⏳</span>
            <span>{formatDurationCompact(waitSec)}</span>
          </div>
        ) : null}
        <div className="process-node__stat process-node__stat--total">
          <span>{formatDurationCompact(humanSec + machineSec + waitSec)}</span>
        </div>
      </div>

      <div className="process-node__meta">
        {step.operators > 0 && <span>{step.operators} op</span>}
        {step.machines > 0 && <span>{step.machines} mc</span>}
        {hasChildMap && <span>{metric?.child_step_count ?? '?'} substeps</span>}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  )
}
