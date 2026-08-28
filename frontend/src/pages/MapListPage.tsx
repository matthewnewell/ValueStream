import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateMap, useDeleteMap, useDuplicateMap, useMaps } from '../api/hooks'
import './MapListPage.css'

export default function MapListPage() {
  const { data: maps, isLoading } = useMaps()
  const createMap = useCreateMap()
  const deleteMap = useDeleteMap()
  const duplicateMap = useDuplicateMap()
  const navigate = useNavigate()
  const [newName, setNewName] = useState('')

  function handleCreate() {
    const name = newName.trim() || 'Untitled value stream'
    createMap.mutate(
      { name },
      { onSuccess: (map) => navigate(`/maps/${map.id}`) },
    )
    setNewName('')
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    deleteMap.mutate(id)
  }

  return (
    <div className="map-list-page">
      <header className="map-list-page__header">
        <div>
          <h1>Value Stream</h1>
          <p>Visual value stream maps — find your bottlenecks.</p>
        </div>
        <div className="map-list-page__header-links">
          <button className="map-list-page__guide-link" onClick={() => navigate('/library')}>
            📚 Map Library
          </button>
          <button className="map-list-page__guide-link" onClick={() => navigate('/guide')}>
            📘 Theory of Operation
          </button>
        </div>
      </header>

      <div className="map-list-page__create">
        <input
          placeholder="New value stream name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate} disabled={createMap.isPending}>
          + New map
        </button>
      </div>

      {isLoading && <div className="map-list-page__loading">Loading maps…</div>}

      {/* Existing maps land on BLUF first (the executive-summary view) — editing is a
          deliberate next step from there, not the default landing. New maps skip straight to
          the editor instead (handleCreate above): an empty map has nothing to summarize yet. */}
      <div className="map-list-page__grid">
        {maps?.map((m) => (
          <div key={m.id} className="map-card" onClick={() => navigate(`/maps/${m.id}/bluf`)}>
            <div className="map-card__name">{m.name}</div>
            {m.description && <div className="map-card__desc">{m.description}</div>}
            <div className="map-card__meta">
              <span>{m.step_count} step{m.step_count !== 1 ? 's' : ''}</span>
              <span>Updated {new Date(m.updated_at).toLocaleDateString()}</span>
            </div>
            <div className="map-card__actions" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => duplicateMap.mutate({ id: m.id })}>Duplicate</button>
              <button className="map-card__delete" onClick={() => handleDelete(m.id, m.name)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {maps?.length === 0 && !isLoading && (
        <div className="map-list-page__empty">No value stream maps yet — create one above.</div>
      )}
    </div>
  )
}
