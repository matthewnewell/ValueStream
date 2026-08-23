import { useAiInsights } from '../api/hooks'
import './InsightsPanel.css'

interface InsightsPanelProps {
  mapId: string
  aiConfigured: boolean
  onClose: () => void
}

export default function InsightsPanel({ mapId, aiConfigured, onClose }: InsightsPanelProps) {
  const aiInsights = useAiInsights(mapId)

  return (
    <div className="insights-panel">
      <div className="insights-panel__header">
        <h3>✨ AI Bottleneck Analysis</h3>
        <button className="insights-panel__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {!aiConfigured && (
        <div className="insights-panel__empty">
          AI is not configured for this instance. Set <code>AI_PROVIDER</code> to{' '}
          <code>claude</code> or <code>ollama</code> to enable narrative analysis. All core
          mapping and metrics features work fully without it.
        </div>
      )}

      {aiConfigured && !aiInsights.data && !aiInsights.isPending && (
        <div className="insights-panel__prompt">
          <p>Get an AI-written analysis of this map's bottleneck, wait-time drivers, and
          concrete improvement suggestions.</p>
          <button className="insights-panel__run-btn" onClick={() => aiInsights.mutate()}>
            Analyze this map
          </button>
        </div>
      )}

      {aiInsights.isPending && (
        <div className="insights-panel__loading">Analyzing the map… this can take up to 30s.</div>
      )}

      {aiInsights.isError && (
        <div className="insights-panel__error">
          {aiInsights.error instanceof Error ? aiInsights.error.message : 'Analysis failed.'}
        </div>
      )}

      {aiInsights.data?.error && (
        <div className="insights-panel__error">{aiInsights.data.error}</div>
      )}

      {aiInsights.data?.narrative && (
        <div className="insights-panel__narrative">
          {aiInsights.data.narrative.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          <button className="insights-panel__rerun-btn" onClick={() => aiInsights.mutate()}>
            Re-analyze
          </button>
        </div>
      )}
    </div>
  )
}
