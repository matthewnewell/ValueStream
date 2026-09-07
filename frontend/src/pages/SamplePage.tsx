import { Navigate } from 'react-router-dom'
import { useSampleMap } from '../api/hooks'
import './vsm-shared.css'

/** The nav's "Sample Map" — there's no page of its own, it just resolves the one map tagged
 * lifecycle='sample' on the backend and forwards to its (read-only) BLUF. A representative map
 * to look at without opening the library. */
export default function SamplePage() {
  const { data, isLoading, isError } = useSampleMap()

  if (isLoading) {
    return (
      <div className="vsm-page">
        <div className="vsm-loading">Loading the sample map…</div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="vsm-page">
        <p className="vsm-page__intro">No sample map is configured.</p>
      </div>
    )
  }

  return <Navigate to={`/maps/${data.id}/bluf`} replace />
}
