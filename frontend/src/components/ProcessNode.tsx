import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { Step } from '../api/types'
import { formatDurationCompact } from '../lib/duration'
import './ProcessNode.css'

export type ProcessNodeData = {
  step: Step
  isCritical: boolean
  isBottleneck: boolean
  isDisconnected: boolean
  pctOfLeadTime: number
}

export type ProcessNodeType = Node<ProcessNodeData, 'process'>

export default function ProcessNode({ data, selected }: NodeProps<ProcessNodeType>) {
  const { step, isCritical, isBottleneck, isDisconnected, pctOfLeadTime } = data
  const processingTime = step.human_time_sec + step.machine_time_sec

  const classes = ['process-node']
  if (isCritical) classes.push('process-node--critical')
  if (isBottleneck) classes.push('process-node--bottleneck')
  if (isDisconnected) classes.push('process-node--disconnected')
  if (selected) classes.push('process-node--selected')

  return (
    <div className={classes.join(' ')}>
      <Handle type="target" position={Position.Left} />

      {isBottleneck && <div className="process-node__flag" title="Throughput bottleneck">🔥</div>}

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
          <span>{formatDurationCompact(step.human_time_sec)}</span>
        </div>
        <div className="process-node__stat">
          <span className="process-node__stat-label">⚙️</span>
          <span>{formatDurationCompact(step.machine_time_sec)}</span>
        </div>
        <div className="process-node__stat process-node__stat--total">
          <span>{formatDurationCompact(processingTime)}</span>
        </div>
      </div>

      <div className="process-node__meta">
        {step.operators > 0 && <span>{step.operators} op</span>}
        {step.machines > 0 && <span>{step.machines} mc</span>}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  )
}
