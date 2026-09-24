import { AppHeader, tabClass } from '@conways/drawer'
import { NavLink } from 'react-router-dom'

/** The ecosystem's shared header (@conways/drawer's AppHeader): back to where you came from in
 * Conway's Depot, the app and its tabs, and the "viewing as" user menu. */
export default function VsmNav() {
  return (
    <AppHeader
      brand={
        <NavLink to="/" className="ch-brand">
          Value Stream
        </NavLink>
      }
      right={
        <NavLink to="/admin" className={({ isActive }) => tabClass(isActive)} title="Manage maps">
          ⚙ Admin
        </NavLink>
      }
    >
      <NavLink to="/sample" className={({ isActive }) => tabClass(isActive)}>
        Sample Map
      </NavLink>
      <NavLink to="/library" className={({ isActive }) => tabClass(isActive)}>
        Map Library
      </NavLink>
    </AppHeader>
  )
}
