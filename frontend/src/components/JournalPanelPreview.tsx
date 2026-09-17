import { useState } from 'react'
import './JournalPanelPreview.css'

/**
 * UX preview only — static mock data, no backend calls. Step 1 of the Chat/Journal tab-strip
 * proposal: evaluate the shape (shared tab header, shared panel width, entries + scope toggle +
 * composer matching the standalone embed widget's visual language) before building the real
 * "dock mode" the embeddable widget (components/JournalEmbed.tsx, backend/embed_assets/
 * journal.js) would need to render live data in this same slot. Delete this file once that
 * real wiring replaces it, or keep it if the dock-mode work goes a different direction.
 */

interface MockEntry {
  id: string
  time: string
  author: string | null
  source: string | null
  summary: string
}

const MOCK_ENTRIES: MockEntry[] = [
  {
    id: '1',
    time: 'Sep 17, 9:12 AM',
    author: 'Sam Ortiz',
    source: null,
    summary: 'Customer moved award date up two weeks.',
  },
  {
    id: '2',
    time: 'Sep 15, 8:34 AM',
    author: 'Sam Ortiz',
    source: 'Value Stream',
    summary: 'Kickoff complete — flow reflects the current bracket redesign scope.',
  },
  {
    id: '3',
    time: 'Sep 14, 3:02 PM',
    author: 'Jess Kim',
    source: 'WinMax',
    summary: 'P(Win) moved to 62% after the gate review.',
  },
]

export default function JournalPanelPreview() {
  const [scope, setScope] = useState<'mine' | 'whole'>('whole')
  const [text, setText] = useState('')

  const entries = scope === 'mine' ? MOCK_ENTRIES.filter((e) => !e.source || e.source === 'Value Stream') : MOCK_ENTRIES

  return (
    <div className="journal-preview">
      <div className="journal-preview__banner">Preview — mock data, not wired up yet</div>

      <select className="journal-preview__picker" defaultValue="project">
        <option value="project">Demo: Bracket Assembly Program</option>
      </select>

      <div className="journal-preview__scope-toggle">
        <button
          className={`journal-preview__scope-btn${scope === 'mine' ? ' journal-preview__scope-btn--active' : ''}`}
          onClick={() => setScope('mine')}
        >
          This app
        </button>
        <button
          className={`journal-preview__scope-btn${scope === 'whole' ? ' journal-preview__scope-btn--active' : ''}`}
          onClick={() => setScope('whole')}
        >
          Whole project
        </button>
      </div>

      <div className="journal-preview__list">
        {entries.map((e) => (
          <div key={e.id} className="journal-preview__entry">
            <div className="journal-preview__entry-meta">
              <span>{e.time}</span>
              {e.author && <span>{e.author}</span>}
              {e.source && <span className="journal-preview__entry-source">{e.source}</span>}
            </div>
            <p className="journal-preview__entry-body">{e.summary}</p>
          </div>
        ))}
      </div>

      <div className="journal-preview__composer">
        <textarea
          className="journal-preview__input"
          rows={2}
          placeholder="Log a note…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="journal-preview__submit" disabled={!text.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}
