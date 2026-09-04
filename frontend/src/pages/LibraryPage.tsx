import { useNavigate } from 'react-router-dom'
import { useDuplicateMap, useTemplateMaps } from '../api/hooks'
import type { MapSummary } from '../api/types'
import './LibraryPage.css'

/** The map library: reusable starting points, cloned (never edited in place) to start a new
 * project. Own route, same "full page" pattern as BLUF/Guide — a distinct concern from the
 * project list, not a filter/tab bolted onto it. */
export default function LibraryPage() {
  const navigate = useNavigate()
  const { data: templates, isLoading } = useTemplateMaps()
  const duplicateMap = useDuplicateMap()

  // Cloning a template is the same duplicate endpoint every map uses — the server always
  // drops is_template on the copy, so what comes back is just a normal project map. Land
  // straight in its editor: the point of cloning is to start customizing it right away, not
  // to admire the summary of a map you haven't touched yet.
  function handleClone(id: string, name: string) {
    const newName = name.replace(/^Template:\s*/, '').replace(/\s*\(copy\)$/, '')
    duplicateMap.mutate(
      { id, name: newName },
      { onSuccess: (map) => navigate(`/maps/${map.id}`) },
    )
  }

  const groups = new Map<string, MapSummary[]>()
  for (const t of templates ?? []) {
    const key = t.template_category ?? 'Other'
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  return (
    <div className="library-page">
      <div className="library-page__toolbar">
        <h1 className="library-page__title">Map Library</h1>
      </div>

      <div className="library-page__content">
        <p className="library-page__intro">
          Starting points for a new value stream, ready to clone and customize — not live
          projects. Cloning creates your own editable copy; the template itself never changes.
        </p>

        {isLoading && <div className="library-page__loading">Loading library…</div>}

        {!isLoading && (templates?.length ?? 0) === 0 && (
          <div className="library-page__empty">No templates in the library yet.</div>
        )}

        {[...groups.entries()].map(([category, maps]) => (
          <section key={category} className="library-group">
            <h2 className="library-group__title">{category}</h2>
            <div className="library-grid">
              {maps.map((m) => (
                <div key={m.id} className="library-card">
                  <div className="library-card__name">{m.name.replace(/^Template:\s*/, '')}</div>
                  {m.description && <div className="library-card__desc">{m.description}</div>}
                  <div className="library-card__meta">
                    <span>{m.step_count} step{m.step_count !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    className="library-card__clone"
                    onClick={() => handleClone(m.id, m.name)}
                    disabled={duplicateMap.isPending}
                  >
                    📋 Clone to new project
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
