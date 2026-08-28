import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCreateStep, useExpandStep, useMap, useMapMetrics, useUpdateMap } from '../api/hooks'
import MapCanvas from '../components/MapCanvas'
import MapToolbar from '../components/MapToolbar'
import MetricsBar from '../components/MetricsBar'
import StepDrawer from '../components/StepDrawer'
import EdgeDrawer from '../components/EdgeDrawer'
import './MapEditorPage.css'

export default function MapEditorPage() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { data: map, isLoading } = useMap(mapId)
  const { data: metrics, isLoading: metricsLoading } = useMapMetrics(mapId)
  const updateMap = useUpdateMap(mapId ?? '')
  const createStep = useCreateStep(mapId ?? '')
  const expandStep = useExpandStep(mapId ?? '')

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  if (!mapId) return null
  if (isLoading || !map) return <div className="map-editor-page__loading">Loading map…</div>

  const selectedStep = map.steps.find((s) => s.id === selectedStepId) ?? null
  const selectedEdge = map.edges.find((e) => e.id === selectedEdgeId) ?? null
  const stepsById = new Map(map.steps.map((s) => [s.id, s]))

  function handleSelectStep(stepId: string | null) {
    setSelectedEdgeId(null)
    setSelectedStepId(stepId)
  }

  function handleSelectEdge(edgeId: string | null) {
    setSelectedStepId(null)
    setSelectedEdgeId(edgeId)
  }

  function handleAddStep() {
    // Spread new steps out a bit so they don't all stack on top of each other.
    const offset = map!.steps.length * 24
    createStep.mutate(
      { name: 'New step', pos_x: 120 + offset, pos_y: 120 + offset },
      { onSuccess: (step) => handleSelectStep(step.id) },
    )
  }

  // Double-click (or the node's ⤵ badge) drills into a step's sub-process — creating one on
  // the fly if it doesn't have one yet, so "explode this step" is a single action either way.
  // Lands on the child map's BLUF, same "arriving at a map lands on its summary" rule as
  // everywhere else — not straight into its editor.
  function handleExpandStep(stepId: string) {
    const step = map!.steps.find((s) => s.id === stepId)
    if (step?.child_map_id) {
      navigate(`/maps/${step.child_map_id}/bluf`)
      return
    }
    expandStep.mutate(stepId, {
      onSuccess: (childMap) => navigate(`/maps/${childMap.id}/bluf`),
    })
  }

  return (
    <div className="map-editor-page">
      <MapToolbar
        mapId={mapId}
        mapName={map.name}
        view="editor"
        onRenameMap={(name) => updateMap.mutate({ name })}
        actions={<button onClick={handleAddStep}>+ Add step</button>}
      />

      <MetricsBar metrics={metrics} isLoading={metricsLoading} />

      <div className="map-editor-page__body">
        <div className="map-editor-page__canvas">
          <MapCanvas
            mapId={mapId}
            map={map}
            metrics={metrics}
            selectedStepId={selectedStepId}
            onSelectStep={handleSelectStep}
            selectedEdgeId={selectedEdgeId}
            onSelectEdge={handleSelectEdge}
            onExpandStep={handleExpandStep}
          />
        </div>

        {selectedStep && (
          <StepDrawer
            mapId={mapId}
            step={selectedStep}
            metric={metrics?.step_metrics[selectedStep.id]}
            onClose={() => setSelectedStepId(null)}
            onExpand={() => handleExpandStep(selectedStep.id)}
          />
        )}

        {selectedEdge && (
          <EdgeDrawer
            mapId={mapId}
            edge={selectedEdge}
            sourceStepName={stepsById.get(selectedEdge.source_step_id)?.name ?? '?'}
            targetStepName={stepsById.get(selectedEdge.target_step_id)?.name ?? '?'}
            onClose={() => setSelectedEdgeId(null)}
          />
        )}
      </div>
    </div>
  )
}
