import { useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useHealth } from '../api/hooks'
import Breadcrumb from '../components/Breadcrumb'
import MapChatPanel from '../components/MapChatPanel'
import VsmNav from '../components/VsmNav'
import './MapLayout.css'

/** Shared parent for /maps/:mapId and /maps/:mapId/timeline. React Router keeps this element
 * mounted while swapping only the <Outlet /> content between the Node and Timeline views — that's
 * what makes the chat panel (and its conversation state) survive toggling between them,
 * rather than remounting fresh on every navigation. The persistent VsmNav sits on top here
 * too (same as every other page), then Breadcrumb for nested sub-process maps, then each
 * view's own MapToolbar. */
export default function MapLayout() {
  const { mapId } = useParams<{ mapId: string }>()
  const { data: health } = useHealth()
  const [chatOpen, setChatOpen] = useState(true)

  if (!mapId) return null

  return (
    <div className="map-layout">
      <VsmNav />
      <Breadcrumb mapId={mapId} />
      <div className="map-layout__row">
        <div className="map-layout__main">
          <Outlet />
        </div>

        {chatOpen ? (
          <MapChatPanel
            mapId={mapId}
            aiConfigured={health?.ai_configured ?? false}
            onCollapse={() => setChatOpen(false)}
          />
        ) : (
          <button
            className="map-layout__chat-tab"
            onClick={() => setChatOpen(true)}
            title="Open chat"
          >
            ✨ Chat
          </button>
        )}
      </div>
    </div>
  )
}
