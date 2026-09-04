import { useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { MapDetail, MapMetrics } from '../api/types'
import { useCreateEdge, useUpdateStep } from '../api/hooks'
import ProcessNode, { type ProcessNodeType } from './ProcessNode'
import WaitEdge, { type WaitEdgeType } from './WaitEdge'

// Defined once at module scope — passing fresh object literals to React Flow on every render
// triggers its dev-mode warning and real re-render cost.
const nodeTypes = { process: ProcessNode }
const edgeTypes = { wait: WaitEdge }

interface MapCanvasProps {
  mapId: string
  map: MapDetail
  metrics: MapMetrics | undefined
  selectedStepId: string | null
  onSelectStep: (stepId: string | null) => void
  selectedEdgeId: string | null
  onSelectEdge: (edgeId: string | null) => void
  /** Navigate into a step's sub-process (creating one first if it doesn't have one yet). */
  onExpandStep: (stepId: string) => void
}

function toFlowNodes(map: MapDetail, metrics: MapMetrics | undefined): ProcessNodeType[] {
  return map.steps.map((step) => {
    const metric = metrics?.step_metrics[step.id]
    return {
      id: step.id,
      type: 'process',
      position: { x: step.pos_x, y: step.pos_y },
      // Known dimensions (matches ProcessNode.css's fixed 190px width and roughly-fixed
      // content height) so React Flow can render nodes and route edges immediately instead of
      // waiting on its ResizeObserver-based auto-measurement (which then corrects these once
      // the node actually mounts). `measured` specifically — not just `width`/`height` — is
      // what React Flow's internal `adoptUserNodes` copies into handle-bounds computation
      // (@xyflow/system's `parseHandles`, gated on `userNode.measured` being set); without it,
      // handle positions — and therefore every edge anchored to this node — never resolve.
      width: 190,
      height: 112,
      measured: { width: 190, height: 112 },
      data: {
        step,
        metric,
        isBottleneck: metrics?.bottleneck?.step_id === step.id,
        isDisconnected: metrics?.disconnected_step_ids.includes(step.id) ?? false,
        onExpand: () => {}, // replaced below once the real handler is in scope
      },
    }
  })
}

function toFlowEdges(map: MapDetail, metrics: MapMetrics | undefined): WaitEdgeType[] {
  return map.edges.map((edge) => ({
    id: edge.id,
    type: 'wait',
    source: edge.source_step_id,
    target: edge.target_step_id,
    data: {
      edge,
      isCritical: metrics?.critical_edge_ids.includes(edge.id) ?? false,
    },
    markerEnd: { type: 'arrowclosed' as const },
  }))
}

function MapCanvasInner({
  mapId,
  map,
  metrics,
  selectedStepId,
  onSelectStep,
  selectedEdgeId,
  onSelectEdge,
  onExpandStep,
}: MapCanvasProps) {
  const initialNodes = useMemo(() => toFlowNodes(map, metrics), [map, metrics])
  const initialEdges = useMemo(() => toFlowEdges(map, metrics), [map, metrics])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const updateStep = useUpdateStep(mapId)
  const createEdge = useCreateEdge(mapId)

  // Resync from the server whenever the map or metrics data changes (after any mutation
  // settles, or on refetchOnWindowFocus). Merge onto existing node objects by id rather than
  // replacing the array wholesale: React Flow attaches internal measurement state (`measured`,
  // used to size handles/edge anchors) to the node object itself, and a resync happens on
  // essentially every mutation (position drag, drawer save, AI suggest). Discarding that
  // object on each resync forced continuous remeasurement and — because a metrics refetch
  // triggers another resync as soon as the previous one starts remeasuring — could starve
  // React Flow of a stable frame in which to ever finish measuring, leaving nodes permanently
  // invisible and edges permanently unrendered (they need both endpoints measured to path).
  useEffect(() => {
    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]))
      return initialNodes.map((incoming) => {
        const existing = byId.get(incoming.id)
        return existing ? { ...existing, data: incoming.data, position: incoming.position } : incoming
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes])

  useEffect(() => {
    setEdges((current) => {
      const byId = new Map(current.map((e) => [e.id, e]))
      return initialEdges.map((incoming) => {
        const existing = byId.get(incoming.id)
        return existing ? { ...existing, data: incoming.data } : incoming
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEdges])

  const handleNodeDragStop: OnNodeDrag<ProcessNodeType> = (_, node) => {
    updateStep.mutate({
      stepId: node.id,
      data: { pos_x: node.position.x, pos_y: node.position.y },
    })
  }

  const handleConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return
    createEdge.mutate({
      source_step_id: connection.source,
      target_step_id: connection.target,
    })
  }

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    onSelectEdge(null)
    onSelectStep(node.id)
  }

  const handleEdgeClick: EdgeMouseHandler = (_, edge) => {
    onSelectStep(null)
    onSelectEdge(edge.id)
  }

  const renderedNodes = nodes.map((n) => ({
    ...n,
    selected: n.id === selectedStepId,
    data: { ...n.data, onExpand: onExpandStep },
  }))

  const renderedEdges = edges.map((e) => ({ ...e, selected: e.id === selectedEdgeId }))

  return (
    <ReactFlow
      nodes={renderedNodes}
      edges={renderedEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={handleNodeDragStop}
      onConnect={handleConnect}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onPaneClick={() => {
        onSelectStep(null)
        onSelectEdge(null)
      }}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="vs-minimap" />
    </ReactFlow>
  )
}

export default function MapCanvas(props: MapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MapCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
