import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCloneFromLibrary, useMapLibrary } from '../api/hooks'
import { CloneForm, displayName, usedByLabel } from './LibraryPage'
import './LibraryPage.css'
import './LibraryEntryPage.css'

/** The "show page" for one library entry — mainly the featured templates, whose full
 * description (the 15288 naming rationale, the procurement gating, what's deliberately not
 * drawn) is too long for a grid card. LibraryCard links here instead of cloning inline; this
 * is where Clone actually happens. Reached at /library/:mapId. */
export default function LibraryEntryPage() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { data: entries, isLoading } = useMapLibrary()
  const cloneMap = useCloneFromLibrary()
  const [cloning, setCloning] = useState(false)

  const entry = entries?.find((e) => e.id === mapId)

  if (isLoading) return <div className="library-page__loading">Loading…</div>
  if (!entry) {
    return (
      <div className="library-entry-page">
        <div className="library-entry-page__content">
          <div className="library-entry-page__inner">
            <p className="library-section__empty">
              That library entry isn't there anymore. <Link to="/library">← Back to the library</Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  const name = displayName(entry)
  const paragraphs = (entry.description ?? '').split(/\n\n+/).filter(Boolean)

  function handleClone(portfolio: string, project: string, cloneName: string) {
    cloneMap.mutate(
      { id: entry!.id, portfolio: portfolio || undefined, project: project || undefined, name: cloneName || undefined },
      { onSuccess: (m) => navigate(`/maps/${m.id}`) },
    )
  }

  return (
    <div className="library-entry-page">
      <div className="library-entry-page__content">
        <div className="library-entry-page__inner">
          <Link className="library-entry-page__back" to="/library">
            ← Map Library
          </Link>

          <header className="library-entry-page__header">
            <div className="library-entry-page__headline">
              {entry.template_category && (
                <span className="library-card__category">{entry.template_category}</span>
              )}
              <h1 className="library-entry-page__title">{name}</h1>
              <div className="library-card__meta">
                <span>{entry.step_count} step{entry.step_count !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{usedByLabel(entry.used_by_projects)}</span>
              </div>
            </div>
            <div className="library-entry-page__action">
              <Link className="library-btn library-btn--primary library-entry-page__preview-btn" to={`/maps/${entry.id}`}>
                👁 Preview the map
              </Link>
              <p className="library-entry-page__preview-hint">
                Opens the read-only map — Timeline, Node view, and any nested sub-processes.
              </p>
              {cloning ? (
                <CloneForm
                  defaultName={name}
                  onCancel={() => setCloning(false)}
                  onClone={handleClone}
                  pending={cloneMap.isPending}
                />
              ) : (
                <button className="library-btn library-btn--ghost" onClick={() => setCloning(true)}>
                  📋 Clone into project
                </button>
              )}
            </div>
          </header>

          {paragraphs.length > 0 && (
            <section className="library-entry-page__desc-card">
              <h2 className="library-entry-page__desc-eyebrow">About this template</h2>
              <div className="library-entry-page__desc">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
