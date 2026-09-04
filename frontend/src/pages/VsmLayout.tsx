import { Outlet } from 'react-router-dom'
import VsmNav from '../components/VsmNav'
import './VsmLayout.css'

/** Shared parent for the top-level pages — splash, the map list, the library, admin. Just the
 * persistent nav above the routed content. The map editor / BLUF routes sit outside this
 * (they use MapLayout, with their own toolbar) so the canvas isn't cramped by a second bar. */
export default function VsmLayout() {
  return (
    <div className="vsm-layout">
      <VsmNav />
      <div className="vsm-layout__main">
        <Outlet />
      </div>
    </div>
  )
}
