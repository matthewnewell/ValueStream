import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useCreateStep,
  useExpandStep,
  useHealth,
  useMap,
  useMapMetrics,
  useUpdateMap,
} from '../api/hooks'
import Breadcrumb from '../components/Breadcrumb'
import MapCanvas from '../components/MapCanvas'
import MetricsBar from '../components/MetricsBar'
import StepDrawer from '../components/StepDrawer'
import EdgeDrawer from '../components/EdgeDrawer'
import InsightsPanel from '../components/InsightsPanel'
import WaitContributorsPanel from '../components/WaitContributorsPanel'
import './MapEditorPage.css'

export default function MapEditorPage() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { data: map, isLoading } = useMap(mapId)
  const { data: metrics, isLoading: metricsLoading } = useMapMetrics(mapId)
  const { data: health } = useHealth()
  const updateMap = useUpdateMap(mapId ?? '')
  const createStep = useCreateStep(mapId ?? '')
  const expandStep = useExpandStep(mapId ?? '')

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [showInsights, setShowInsights] = useState(false)
  const [showWaitPanel, setShowWaitPanel] = useState(false)

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
  function handleExpandStep(stepId: string) {
    const step = map!.steps.find((s) => s.id === stepId)
    if (step?.child_map_id) {
      navigate(`/maps/${step.child_map_id}`)
      return
    }
    expandStep.mutate(stepId, {
      onSuccess: (childMap) => navigate(`/maps/${childMap.id}`),
    })
  }

  return (
    <div className="map-editor-page">
      <Breadcrumb mapId={mapId} />
      <div className="map-editor-page__toolbar">
        <button className="map-editor-page__back" onClick={() => navigate('/')}>
          ← Maps
        </button>
        <input
          className="map-editor-page__title"
          value={map.name}
          onChange={(e) => updateMap.mutate({ name: e.target.value })}
        />
        <div className="map-editor-page__toolbar-actions">
          <button onClick={handleAddStep}>+ Add step</button>
          <button
            className={showWaitPanel ? 'map-editor-page__insights-btn--active' : ''}
            onClick={() => {
              setShowInsights(false)
              setShowWaitPanel((v) => !v)
            }}
          >
            ⏳ Wait contributors
          </button>
          <button
            className={showInsights ? 'map-editor-page__insights-btn--active' : ''}
            onClick={() => {
              setShowWaitPanel(false)
              setShowInsights((v) => !v)
            }}
          >
            ✨ Analyze bottlenecks
          </button>
          <button onClick={() => navigate(`/maps/${mapId}/bluf`)}>📋 BLUF</button>
        </div>
      </div>

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

        {showWaitPanel && (
          <WaitContributorsPanel
            contributors={metrics?.wait_contributors ?? []}
            onClose={() => setShowWaitPanel(false)}
            onSelectEdge={handleSelectEdge}
          />
        )}

        {showInsights && (
          <InsightsPanel
            mapId={mapId}
            aiConfigured={health?.ai_configured ?? false}
            onClose={() => setShowInsights(false)}
          />
        )}
      </div>
    </div>
  )
}
