import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCloneFromLibrary, useMapLibrary } from '../api/hooks'
import type { LibraryEntry } from '../api/types'
import './LibraryPage.css'

/** The Map Library: featured 15288 scaffolds up top, then the growing list of maps published
 * from real projects at closeout — each cloned (never edited in place) to start a new project.
 * "Used by N projects" is the reuse signal. Own route, same "full page" pattern as BLUF. */
export default function LibraryPage() {
  const navigate = useNavigate()
  const { data: entries, isLoading } = useMapLibrary()
  const cloneMap = useCloneFromLibrary()
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [sortDesc, setSortDesc] = useState(true)

  const featured = (entries ?? []).filter((e) => e.lifecycle === 'featured')
  const published = useMemo(() => {
    const list = (entries ?? []).filter((e) => e.lifecycle === 'published')
    return list.sort(
      (a, b) =>
        (sortDesc ? b.used_by_projects - a.used_by_projects : a.used_by_projects - b.used_by_projects) ||
        a.name.localeCompare(b.name),
    )
  }, [entries, sortDesc])

  const featuredGroups = useMemo(() => {
    const groups = new Map<string, LibraryEntry[]>()
    for (const e of featured) {
      const key = e.template_category ?? 'Other'
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    return [...groups.entries()]
  }, [featured])

  function handleClone(id: string, portfolio: string, project: string, name: string) {
    cloneMap.mutate(
      { id, portfolio: portfolio || undefined, project: project || undefined, name: name || undefined },
      { onSuccess: (m) => navigate(`/maps/${m.id}`) },
    )
  }

  return (
    <div className="library-page">
      <div className="library-page__content">
        <div className="library-page__inner">
        <p className="library-page__intro">
          Starting points for a new value stream, ready to clone and customize. Cloning creates
          your own editable copy filed under a project — the library entry itself never changes.
        </p>

        {isLoading && <div className="library-page__loading">Loading library…</div>}

        {/* ── Featured: org-issued generic scaffolds ── */}
        {featuredGroups.length > 0 && (
          <section className="library-section">
            <h2 className="library-section__title">Featured — issued by the organization</h2>
            {featuredGroups.map(([category, maps]) => (
              <div key={category} className="library-group">
                <h3 className="library-group__title">{category}</h3>
                <div className="library-grid">
                  {maps.map((m) => (
                    <LibraryCard
                      key={m.id}
                      entry={m}
                      cloning={cloningId === m.id}
                      onStartClone={() => setCloningId(m.id)}
                      onCancelClone={() => setCloningId(null)}
                      onClone={(portfolio, project, name) => handleClone(m.id, portfolio, project, name)}
                      pending={cloneMap.isPending}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── Published: real projects, contributed at closeout ── */}
        <section className="library-section">
          <h2 className="library-section__title">From projects — published at closeout</h2>
          {published.length === 0 ? (
            <p className="library-section__empty">
              No project maps published yet. When a project wraps, open its map's BLUF and choose
              <strong> Publish to Library</strong> — it lands here with its real recorded numbers.
            </p>
          ) : (
            <table className="library-table">
              <thead>
                <tr>
                  <th>Value stream</th>
                  <th>Origin project</th>
                  <th>Portfolio</th>
                  <th className="library-table__num">Steps</th>
                  <th
                    className="library-table__num library-table__sortable"
                    onClick={() => setSortDesc((d) => !d)}
                    title="Sort by reuse"
                  >
                    Used by {sortDesc ? '▾' : '▴'}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {published.map((m) => (
                  <PublishedRow
                    key={m.id}
                    entry={m}
                    cloning={cloningId === m.id}
                    onStartClone={() => setCloningId(m.id)}
                    onCancelClone={() => setCloningId(null)}
                    onClone={(portfolio, project, name) => handleClone(m.id, portfolio, project, name)}
                    pending={cloneMap.isPending}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
        </div>
      </div>
    </div>
  )
}

// ── Clone-into-a-project form, shared by the featured cards and the published rows ──────────
function CloneForm({
  defaultName,
  onCancel,
  onClone,
  pending,
}: {
  defaultName: string
  onCancel: () => void
  onClone: (portfolio: string, project: string, name: string) => void
  pending: boolean
}) {
  const [portfolio, setPortfolio] = useState('')
  const [project, setProject] = useState('')
  const [name, setName] = useState(defaultName)

  return (
    <div className="clone-form">
      <label>
        <span>Value stream name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="clone-form__row">
        <label>
          <span>Portfolio</span>
          <input value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="optional" />
        </label>
        <label>
          <span>Project</span>
          <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="which project is this for?" />
        </label>
      </div>
      <div className="clone-form__actions">
        <button
          className="library-btn library-btn--primary"
          disabled={pending}
          onClick={() => onClone(portfolio.trim(), project.trim(), name.trim())}
        >
          {pending ? 'Cloning…' : 'Clone into project →'}
        </button>
        <button className="library-btn library-btn--ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function usedByLabel(n: number) {
  return n === 0 ? 'Not cloned yet' : `Used by ${n} project${n === 1 ? '' : 's'}`
}

function LibraryCard({
  entry,
  cloning,
  onStartClone,
  onCancelClone,
  onClone,
  pending,
}: {
  entry: LibraryEntry
  cloning: boolean
  onStartClone: () => void
  onCancelClone: () => void
  onClone: (portfolio: string, project: string, name: string) => void
  pending: boolean
}) {
  const displayName = entry.name.replace(/^Template:\s*/, '')
  return (
    <div className="library-card">
      <div className="library-card__name">{displayName}</div>
      {entry.description && <div className="library-card__desc">{entry.description}</div>}
      <div className="library-card__meta">
        <span>{entry.step_count} step{entry.step_count !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{usedByLabel(entry.used_by_projects)}</span>
      </div>
      {cloning ? (
        <CloneForm defaultName={displayName} onCancel={onCancelClone} onClone={onClone} pending={pending} />
      ) : (
        <button className="library-btn library-btn--primary library-card__clone" onClick={onStartClone}>
          📋 Clone into project
        </button>
      )}
    </div>
  )
}

function PublishedRow({
  entry,
  cloning,
  onStartClone,
  onCancelClone,
  onClone,
  pending,
}: {
  entry: LibraryEntry
  cloning: boolean
  onStartClone: () => void
  onCancelClone: () => void
  onClone: (portfolio: string, project: string, name: string) => void
  pending: boolean
}) {
  return (
    <>
      <tr className="library-table__row">
        <td className="library-table__strong">{entry.name}</td>
        <td>{entry.project ?? <span className="library-table__muted">—</span>}</td>
        <td>{entry.portfolio ?? <span className="library-table__muted">—</span>}</td>
        <td className="library-table__num">{entry.step_count}</td>
        <td className="library-table__num">{entry.used_by_projects}</td>
        <td className="library-table__actions">
          {!cloning && (
            <button className="library-btn library-btn--ghost" onClick={onStartClone}>
              Clone
            </button>
          )}
        </td>
      </tr>
      {cloning && (
        <tr className="library-table__form-row">
          <td colSpan={6}>
            <CloneForm defaultName={entry.name} onCancel={onCancelClone} onClone={onClone} pending={pending} />
          </td>
        </tr>
      )}
    </>
  )
}
