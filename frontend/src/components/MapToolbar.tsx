import { Link, useNavigate } from 'react-router-dom'
import './MapToolbar.css'

interface MapToolbarProps {
  mapId: string
  mapName: string
  view: 'timeline' | 'node' | 'journal'
  /** Present only on the Node view, where the title doubles as a rename field. The Timeline
   * view's title is read-only — renaming happens where you edit everything else. */
  onRenameMap?: (name: string) => void
  /** View-specific page actions (Add step on Node, Publish on Timeline), rendered just left of
   * the Timeline/Node toggle. */
  actions?: React.ReactNode
  /** A published snapshot or a featured scaffold: frozen — a "Read-only" pill sits alongside
   * the Timeline/Node/Journal toggle (still previewable, just not editable), and a "← Back to
   * template" link appears above the title, back to where it was cloned from. */
  readOnly?: boolean
  /** The sample map: editable like any working map, plus a "↺ Reset" button that restores it
   * to the seeded state. */
  onReset?: () => void
}

/** Map-scoped bar under the persistent VsmNav: the map's name (an editable field on the Node
 * view) on the left, and on the right the toggle between the Timeline view (analysis + journal)
 * and the Node view (the graph) — replaced by a plain "Read-only" pill on a frozen library
 * map. App-level navigation (home, Sample Map, Map Library, Admin) lives in VsmNav above;
 * nested sub-process maps get a Breadcrumb between the two. */
export default function MapToolbar({
  mapId,
  mapName,
  view,
  onRenameMap,
  actions,
  readOnly,
  onReset,
}: MapToolbarProps) {
  const navigate = useNavigate()

  return (
    <div className="map-toolbar">
      {readOnly && (
        <Link className="map-toolbar__back" to={`/library/${mapId}`}>
          ← Back to template
        </Link>
      )}

      {onRenameMap && !readOnly ? (
        <input
          className="map-toolbar__title-input"
          value={mapName}
          onChange={(e) => onRenameMap(e.target.value)}
        />
      ) : (
        <h1 className="map-toolbar__title">{mapName}</h1>
      )}

      <div className="map-toolbar__right">
        {onReset && (
          <button
            className="map-toolbar__reset"
            onClick={onReset}
            title="Discard changes and restore the sample map to its original state"
          >
            ↺ Reset
          </button>
        )}

        {actions && <div className="map-toolbar__actions">{actions}</div>}

        {readOnly && (
          <span
            className="map-toolbar__readonly-pill"
            title="Clone this into a project from the Map Library to make changes."
          >
            Read-only
          </span>
        )}

        <div className="map-toolbar__view-toggle" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'timeline'}
            className={`map-toolbar__view-btn ${view === 'timeline' ? 'map-toolbar__view-btn--active' : ''}`}
            onClick={() => navigate(`/maps/${mapId}/timeline`)}
          >
            Timeline
          </button>
          <button
            role="tab"
            aria-selected={view === 'node'}
            className={`map-toolbar__view-btn ${view === 'node' ? 'map-toolbar__view-btn--active' : ''}`}
            onClick={() => navigate(`/maps/${mapId}`)}
          >
            Node
          </button>
          <button
            role="tab"
            aria-selected={view === 'journal'}
            className={`map-toolbar__view-btn ${view === 'journal' ? 'map-toolbar__view-btn--active' : ''}`}
            onClick={() => navigate(`/maps/${mapId}/journal`)}
          >
            Journal
          </button>
        </div>
      </div>
    </div>
  )
}
