import { useEffect, useState } from 'react'

declare global {
  interface Window {
    JournalWidget?: {
      configure: (cfg: {
        depotUrl?: string
        applicationId?: string
        externalRef?: string
      }) => void
    }
  }
}

const DEPOT_URL = 'http://localhost:8090'
const SCRIPT_ID = 'depot-journal-widget-script'
// This app's own id in Conway's Depot's registry — a fixed constant, not read from anywhere in
// this app's own data (see models.py's module docstring: Value Stream stays Depot-unaware of
// its *own* identity too, same as it never learns a Depot project id). Update this if the Depot
// ever re-registers Value Stream under a different id.
const DEPOT_APPLICATION_ID = 'f8bb1434-b8f2-4d10-82e0-5078e4f5d0ca'

/**
 * Loads Conway's Depot's embeddable Journal widget into every map page. Unlike a host that
 * tracks its own persons/projects (e.g. Task Master), this app has neither — so it hands the
 * widget only its own application id + the current map's id, and the widget resolves which
 * Depot project (if any) that map is crosswalked to on its own (GET
 * /api/applications/<id>/project-link — see the widget's own docstring). Reconfigures whenever
 * the map changes, since a different map may belong to a different project or none at all.
 */
export default function JournalEmbed({ mapId }: { mapId: string }) {
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      if (window.JournalWidget) setScriptReady(true)
      else existing.addEventListener('load', () => setScriptReady(true))
      return
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = `${DEPOT_URL}/embed/journal.js`
    script.addEventListener('load', () => setScriptReady(true))
    document.body.appendChild(script)
  }, [])

  useEffect(() => {
    if (!scriptReady) return
    window.JournalWidget?.configure({
      depotUrl: DEPOT_URL,
      applicationId: DEPOT_APPLICATION_ID,
      externalRef: mapId,
    })
  }, [scriptReady, mapId])

  return null
}
