import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateMap, useDeleteMap, useDuplicateMap, useMaps, useUpdateMap } from '../api/hooks'
import type { MapSummary } from '../api/types'
import './vsm-shared.css'
import './AdminPage.css'

/** Managing the set of maps — create, duplicate, delete, and file a map under a portfolio /
 * project. Kept off the main list (which is read-first, for finding a value stream) the same
 * way Conway's Depot splits its Admin page from its registries. No permissions behind it yet. */
export default function AdminPage() {
  const navigate = useNavigate()
  const { data: maps, isLoading } = useMaps()
  const createMap = useCreateMap()
  const deleteMap = useDeleteMap()
  const duplicateMap = useDuplicateMap()

  const [name, setName] = useState('')
  const [portfolio, setPortfolio] = useState('')
  const [project, setProject] = useState('')

  function handleCreate() {
    const trimmed = name.trim() || 'Untitled value stream'
    createMap.mutate(
      { name: trimmed, portfolio: portfolio.trim() || undefined, project: project.trim() || undefined },
      { onSuccess: (m) => navigate(`/maps/${m.id}`) },
    )
    setName(''); setPortfolio(''); setProject('')
  }

  function handleDelete(id: string, mapName: string) {
    if (!confirm(`Delete "${mapName}"? This cannot be undone.`)) return
    deleteMap.mutate(id)
  }

  return (
    <div className="vsm-page">
      <div className="vsm-page__toolbar">
        <h1 className="vsm-page__title">Admin</h1>
      </div>
      <p className="vsm-page__intro">
        No permissions enforced here — a separate management view, as reachable as any other
        nav item for now.
      </p>

      <section className="admin-create">
        <h2 className="admin-section__title">New value stream</h2>
        <div className="admin-create__row">
          <input
            placeholder="Value stream name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <input placeholder="Portfolio (optional)" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} />
          <input placeholder="Project (optional)" value={project} onChange={(e) => setProject(e.target.value)} />
          <button className="vsm-btn" onClick={handleCreate} disabled={createMap.isPending}>
            + Create
          </button>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section__title">Maps</h2>

        {isLoading && <div className="vsm-loading">Loading maps…</div>}

        {!isLoading && (maps?.length ?? 0) === 0 && (
          <div className="vsm-empty">No maps yet — create one above.</div>
        )}

        {!isLoading && (maps?.length ?? 0) > 0 && (
          <table className="vsm-table">
            <thead>
              <tr>
                <th>Value stream</th>
                <th className="admin-table__actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {maps!.map((m) => (
                <AdminRow
                  key={m.id}
                  map={m}
                  onOpen={() => navigate(`/maps/${m.id}`)}
                  onDuplicate={() => duplicateMap.mutate({ id: m.id })}
                  onDelete={() => handleDelete(m.id, m.name)}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function AdminRow({
  map,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  map: MapSummary
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const updateMap = useUpdateMap(map.id)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(map.name)
  const [portfolio, setPortfolio] = useState(map.portfolio ?? '')
  const [project, setProject] = useState(map.project ?? '')
  const [description, setDescription] = useState(map.description ?? '')

  function save() {
    updateMap.mutate(
      {
        name: name.trim() || map.name,
        portfolio: portfolio.trim() || null,
        project: project.trim() || null,
        description: description.trim() || null,
      },
      { onSuccess: () => setEditing(false) },
    )
  }

  if (editing) {
    return (
      <tr className="admin-row--editing">
        <td colSpan={2}>
          <div className="admin-edit">
            <label><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="admin-edit__row">
              <label><span>Portfolio</span><input value={portfolio} onChange={(e) => setPortfolio(e.target.value)} /></label>
              <label><span>Project</span><input value={project} onChange={(e) => setProject(e.target.value)} /></label>
            </div>
            <label>
              <span>Description</span>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="admin-edit__actions">
              <button className="vsm-btn" onClick={save} disabled={updateMap.isPending}>
                {updateMap.isPending ? 'Saving…' : 'Save'}
              </button>
              <button className="vsm-btn vsm-btn--ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  const context = [map.portfolio, map.project].filter(Boolean).join(' · ')

  return (
    <tr>
      <td>
        <button className="admin-table__name" onClick={onOpen}>{map.name}</button>
        <div className="admin-table__context">
          {context || <span className="vsm-table__muted">not filed under a project</span>}
        </div>
      </td>
      <td className="admin-table__actions">
        <button className="vsm-btn vsm-btn--ghost" onClick={() => setEditing(true)}>Edit</button>
        <button className="vsm-btn vsm-btn--ghost" onClick={onDuplicate}>Duplicate</button>
        <button className="vsm-btn vsm-btn--danger" onClick={onDelete}>Delete</button>
      </td>
    </tr>
  )
}
