import { useNavigate, useParams } from 'react-router-dom'
import { useMap, useResetSample } from '../api/hooks'
import Journal from '../components/Journal'
import MapToolbar from '../components/MapToolbar'
import './JournalPage.css'

/** The consolidated journal for one map — every auto-captured edit and every note, from every
 * step and wait, in one feed. The third view in the Timeline / Node / Journal toggle. */
export default function JournalPage() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { data: map, isLoading } = useMap(mapId)
  const resetSample = useResetSample()

  if (!mapId) return null
  if (isLoading || !map) return <div className="jp-page__loading">Loading…</div>

  function handleReset() {
    if (!window.confirm('Reset the sample map? This discards every change and restores the original.')) {
      return
    }
    resetSample.mutate(undefined, { onSuccess: () => navigate('/sample') })
  }

  return (
    <div className="jp-page">
      <MapToolbar
        mapId={mapId}
        mapName={map.name}
        view="journal"
        readOnly={map.read_only}
        onReset={map.lifecycle === 'sample' ? handleReset : undefined}
      />
      <div className="jp-page__content">
        <div className="jp-page__inner">
          <Journal mapId={mapId} editable={!map.read_only} />
        </div>
      </div>
    </div>
  )
}
