import { DrawerLayout } from '@conways/drawer'
import { Outlet, useParams } from 'react-router-dom'
import { useHealth } from '../api/hooks'
import Breadcrumb from '../components/Breadcrumb'
import VsmNav from '../components/VsmNav'
import './MapLayout.css'

// This app's own id in Conway's Depot's registry — a fixed constant. Value Stream stays
// Depot-unaware (it never learns a Depot project id), so the shared Journal resolves the
// project itself from this + the current map id (Depot's /project-link reverse lookup).
const DEPOT_APPLICATION_ID = 'f8bb1434-b8f2-4d10-82e0-5078e4f5d0ca'

/** Shared parent for /maps/:mapId and /maps/:mapId/timeline. React Router keeps this mounted
 * while swapping the <Outlet /> between Node and Timeline views. The Agent | Journal side
 * panel is the ecosystem-wide shared drawer (@conways/drawer) — only the map-scoped chat
 * endpoint and starter prompts are this app's own. */
export default function MapLayout() {
  const { mapId } = useParams<{ mapId: string }>()
  const { data: health } = useHealth()

  if (!mapId) return null

  return (
    <div className="map-layout">
      <VsmNav />
      <Breadcrumb mapId={mapId} />
      <DrawerLayout
        scrollMain={false}
        agent={{
          chatUrl: `/api/maps/${mapId}/chat`,
          aiConfigured: health?.ai_configured ?? false,
          intro:
            "Ask about the bottleneck, why lead time is what it is, what's actually constraining this value stream, or what to fix first.",
          starters: [
            "What's driving my lead time?",
            'Where should I focus first?',
            'Is my bottleneck really the constraint?',
          ],
        }}
        journal={{ resolve: { applicationId: DEPOT_APPLICATION_ID, externalRef: mapId } }}
      >
        <Outlet />
      </DrawerLayout>
    </div>
  )
}
