import { useNavigate } from 'react-router-dom'
import { useMapBreadcrumb } from '../api/hooks'
import './Breadcrumb.css'

interface BreadcrumbProps {
  mapId: string
}

export default function Breadcrumb({ mapId }: BreadcrumbProps) {
  const { data: crumbs } = useMapBreadcrumb(mapId)
  const navigate = useNavigate()

  // A top-level map has a breadcrumb of length 1 (itself) — nothing worth showing then.
  if (!crumbs || crumbs.length <= 1) return null

  return (
    <div className="breadcrumb">
      {crumbs.map((c, i) => (
        <span key={c.map_id} className="breadcrumb__hop">
          {i > 0 && <span className="breadcrumb__sep">›</span>}
          {i === crumbs.length - 1 ? (
            <span className="breadcrumb__current">{c.map_name}</span>
          ) : (
            // Ancestor hops always land on that map's BLUF, same "arriving at a map lands on
            // its summary" rule used everywhere else — regardless of whether you clicked
            // this from the editor or from BLUF itself.
            <button className="breadcrumb__item" onClick={() => navigate(`/maps/${c.map_id}/bluf`)}>
              {c.map_name}
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
