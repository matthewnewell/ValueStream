import { useNavigate } from 'react-router-dom'
import './MapToolbar.css'

interface MapToolbarProps {
  mapId: string
  mapName: string
  view: 'bluf' | 'editor'
  /** Present only on the editor, where the title doubles as a rename field. BLUF's title is
   * read-only — renaming happens where you edit everything else. */
  onRenameMap?: (name: string) => void
  /** Editor-only page actions (Add step, Wait contributors, Analyze bottlenecks), rendered
   * just left of the BLUF/Edit Map toggle. */
  actions?: React.ReactNode
}

/** Shared top bar for both map views. Far-left "← Maps" is a fixed convention — it always
 * returns to the map list, regardless of which view you're on or how deep you navigated in.
 * The right-hand toggle is how you move between BLUF and the editor; it replaces the old
 * one-off "← BLUF" / "✏️ Edit map" buttons that only pointed one direction each. */
export default function MapToolbar({ mapId, mapName, view, onRenameMap, actions }: MapToolbarProps) {
  const navigate = useNavigate()

  return (
    <div className="map-toolbar">
      <button className="map-toolbar__back" onClick={() => navigate('/maps')}>
        ← Maps
      </button>

      {onRenameMap ? (
        <input
          className="map-toolbar__title-input"
          value={mapName}
          onChange={(e) => onRenameMap(e.target.value)}
        />
      ) : (
        <h1 className="map-toolbar__title">{mapName}</h1>
      )}

      <div className="map-toolbar__right">
        {actions && <div className="map-toolbar__actions">{actions}</div>}

        <div className="map-toolbar__view-toggle" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'bluf'}
            className={`map-toolbar__view-btn ${view === 'bluf' ? 'map-toolbar__view-btn--active' : ''}`}
            onClick={() => navigate(`/maps/${mapId}/bluf`)}
          >
            BLUF
          </button>
          <button
            role="tab"
            aria-selected={view === 'editor'}
            className={`map-toolbar__view-btn ${view === 'editor' ? 'map-toolbar__view-btn--active' : ''}`}
            onClick={() => navigate(`/maps/${mapId}`)}
          >
            ✏️ Edit Map
          </button>
        </div>
      </div>
    </div>
  )
}
