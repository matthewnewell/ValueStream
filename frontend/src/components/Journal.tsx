import { useState } from 'react'
import { useAddMapEvent, useDeleteMapEvent, useMapEvents } from '../api/hooks'
import type { MapEvent } from '../api/types'
import { getAuthor, relativeTime, setAuthor } from '../lib/journal'
import './Journal.css'

interface JournalProps {
  mapId: string
  /** Omit for the whole-map feed; pass to scope to one step / edge (the drawer view). */
  target?: { type: 'step' | 'edge'; id: string; name: string }
  editable: boolean
  /** Drawer mode — tighter, no outer heading. */
  compact?: boolean
}

interface Group {
  key: string
  ts: string
  author: string | null
  targetType: string | null
  targetName: string | null
  changes: MapEvent[]
  note: MapEvent | null
}

/** Groups the flat event list back into "one save" clusters (events from a single edit share
 * created_at exactly; the backend sorts changes before the note within each). */
function groupEvents(events: MapEvent[]): Group[] {
  const groups: Group[] = []
  const byKey = new Map<string, Group>()
  for (const e of events) {
    const key = `${e.created_at}|${e.target_id ?? 'map'}`
    let g = byKey.get(key)
    if (!g) {
      g = {
        key,
        ts: e.created_at,
        author: e.author,
        targetType: e.target_type,
        targetName: e.target_name,
        changes: [],
        note: null,
      }
      byKey.set(key, g)
      groups.push(g)
    }
    if (e.kind === 'change') g.changes.push(e)
    else g.note = e
  }
  return groups
}

export default function Journal({ mapId, target, editable, compact }: JournalProps) {
  const { data: events, isLoading } = useMapEvents(mapId, target?.id)
  const addEvent = useAddMapEvent(mapId)
  const deleteEvent = useDeleteMapEvent(mapId)

  const [text, setText] = useState('')
  const [name, setName] = useState(getAuthor())
  const author = getAuthor()

  function submit() {
    const note = text.trim()
    if (!note) return
    if (name.trim() && name.trim() !== author) setAuthor(name)
    addEvent.mutate(
      {
        note,
        author: (name.trim() || author) || undefined,
        ...(target
          ? { target_type: target.type, target_id: target.id, target_name: target.name }
          : { target_type: 'map' as const }),
      },
      { onSuccess: () => setText('') },
    )
  }

  const groups = groupEvents(events ?? [])
  const scoped = !!target

  return (
    <div className={`journal${compact ? ' journal--compact' : ''}`}>
      {!compact && <h2 className="journal__title">Journal</h2>}

      {editable && (
        <div className="journal__composer">
          <textarea
            className="journal__input"
            rows={compact ? 2 : 2}
            placeholder={
              scoped ? 'Note something about this element…' : 'What happened? A slip, a decision, a call…'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
          />
          <div className="journal__composer-row">
            {!author && (
              <input
                className="journal__name"
                placeholder="your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            {author && <span className="journal__as">as {author}</span>}
            <button
              className="journal__add"
              onClick={submit}
              disabled={!text.trim() || addEvent.isPending}
            >
              {addEvent.isPending ? 'Adding…' : 'Add note'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="journal__empty">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="journal__empty">
          {scoped
            ? 'No entries for this element yet.'
            : 'Nothing logged yet. Edits are recorded automatically; add notes for the why.'}
        </p>
      ) : (
        <ol className="journal__feed">
          {groups.map((g) => (
            <li key={g.key} className="journal__entry">
              <div className="journal__meta">
                <span className="journal__author">{g.author || 'Someone'}</span>
                {!scoped && g.targetName && (
                  <span className="journal__on">
                    · {g.targetType === 'edge' ? 'wait' : g.targetType === 'step' ? 'step' : ''}{' '}
                    <strong>{g.targetName}</strong>
                  </span>
                )}
                <span className="journal__time">{relativeTime(g.ts)}</span>
              </div>

              {g.changes.length > 0 && (
                <ul className="journal__changes">
                  {g.changes.map((c) => (
                    <li key={c.id}>
                      {c.field}: <span className="journal__old">{c.old_value}</span>
                      {' → '}
                      <span className="journal__new">{c.new_value}</span>
                    </li>
                  ))}
                </ul>
              )}

              {g.note && (
                <div className="journal__note">
                  <span>{g.note.note}</span>
                  {editable && (
                    <button
                      className="journal__del"
                      title="Delete this note"
                      onClick={() => deleteEvent.mutate(g.note!.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
