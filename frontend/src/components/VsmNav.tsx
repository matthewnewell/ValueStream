import { NavLink } from 'react-router-dom'
import './VsmNav.css'

/** Persistent top bar across the top-level pages (splash, sample, the library, admin), same
 * convention as Conway's Depot. The brand text links to the splash page — what this tool is
 * and how to get value from it. "Sample Map" opens the one read-only demo map; "Map Library"
 * is where you browse and clone. Admin sits apart on the right: managing working maps (create,
 * duplicate, delete, file under a project). The map editor / BLUF pages keep their own toolbar
 * instead of this bar, so the canvas stays uncluttered. */
export default function VsmNav() {
  return (
    <nav className="vsm-nav">
      <NavLink to="/" className="vsm-nav__brand">
        Value Stream
      </NavLink>
      <div className="vsm-nav__links">
        <NavLink
          to="/sample"
          className={({ isActive }) => `vsm-nav__link ${isActive ? 'vsm-nav__link--active' : ''}`}
        >
          Sample Map
        </NavLink>
        <NavLink
          to="/library"
          className={({ isActive }) => `vsm-nav__link ${isActive ? 'vsm-nav__link--active' : ''}`}
        >
          Map Library
        </NavLink>
      </div>
      <NavLink
        to="/admin"
        className={({ isActive }) => `vsm-nav__admin ${isActive ? 'vsm-nav__link--active' : ''}`}
        title="Manage maps"
      >
        ⚙ Admin
      </NavLink>
    </nav>
  )
}
