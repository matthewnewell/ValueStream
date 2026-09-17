import { useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useHealth } from '../api/hooks'
import Breadcrumb from '../components/Breadcrumb'
import JournalPanelPreview from '../components/JournalPanelPreview'
import MapChatPanel from '../components/MapChatPanel'
import VsmNav from '../components/VsmNav'
import './MapLayout.css'

type PanelTab = 'chat' | 'journal' | null

const TABS: { id: Exclude<PanelTab, null>; label: string }[] = [
  { id: 'chat', label: '✨ Agent' },
  { id: 'journal', label: '📝 Journal' },
]

/** Shared parent for /maps/:mapId and /maps/:mapId/timeline. React Router keeps this element
 * mounted while swapping only the <Outlet /> content between the Node and Timeline views — that's
 * what makes the chat panel (and its conversation state) survive toggling between them,
 * rather than remounting fresh on every navigation. The persistent VsmNav sits on top here
 * too (same as every other page), then Breadcrumb for nested sub-process maps, then each
 * view's own MapToolbar.
 *
 * Chat and the Depot's Journal share one side panel — step 1 of the "make this UX consistent"
 * proposal: the Journal tab renders JournalPanelPreview (static mock data) for now, not the
 * real embeddable widget, so the shell/interaction can be evaluated before building the "dock
 * mode" the widget would need to render live data in this same slot.
 *
 * The two tabs are a physical file-drawer metaphor, not a header inside the panel: they live at
 * the same bottom-right spot whether the panel is open or closed (map-layout__tab-rail, always
 * rendered), each poking a little into the main content at rest. Opening one pulls it out
 * further (an extra CSS translateX — see MapLayout.css), overlapping the main content more, the
 * way pulling a folder forward out of a drawer makes its tab jut out past the others. Clicking
 * the already-open tab pushes it back in (closes it) instead of a separate collapse button. */
export default function MapLayout() {
  const { mapId } = useParams<{ mapId: string }>()
  const { data: health } = useHealth()
  // Collapsed by default — the map view is the point; open a tab when you want one.
  const [activeTab, setActiveTab] = useState<PanelTab>(null)

  // Toggling the panel resizes the main column via CSS alone (no re-render of the routed
  // view), so nudge a resize event once the layout has settled — the timeline re-measures
  // off it (its ResizeObserver handles the same in browsers that service one).
  const selectTab = (tab: PanelTab) => {
    setActiveTab(tab)
    setTimeout(() => window.dispatchEvent(new Event('resize')), 80)
  }

  if (!mapId) return null

  return (
    <div className="map-layout">
      <VsmNav />
      <Breadcrumb mapId={mapId} />
      <div className={`map-layout__row${activeTab ? ' map-layout__row--panel-open' : ''}`}>
        <div className="map-layout__main">
          <Outlet />
        </div>

        {activeTab && (
          <aside className="side-panel">
            <div className="side-panel__body">
              {activeTab === 'chat' ? (
                <MapChatPanel
                  mapId={mapId}
                  aiConfigured={health?.ai_configured ?? false}
                  onCollapse={() => selectTab(null)}
                  hideHeader
                />
              ) : (
                <JournalPanelPreview />
              )}
            </div>
          </aside>
        )}

        <div className="map-layout__tab-rail">
          {TABS.map((t) => {
            const isActive = activeTab === t.id
            const bareLabel = t.label.replace(/^\S+\s/, '')
            return (
              <button
                key={t.id}
                className={`map-layout__tab-rail-btn${isActive ? ' map-layout__tab-rail-btn--active' : ''}`}
                onClick={() => selectTab(isActive ? null : t.id)}
                title={isActive ? `Collapse ${bareLabel}` : `Open ${bareLabel}`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
