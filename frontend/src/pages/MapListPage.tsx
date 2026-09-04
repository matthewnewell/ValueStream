import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaps } from '../api/hooks'
import './vsm-shared.css'
import './MapListPage.css'

// A map with no portfolio still needs a checkbox to filter on.
const NO_PORTFOLIO = ' none' as const

/** The value stream list — every live map, filed under its portfolio and project. Click a row
 * to open its BLUF. Creating, duplicating, and deleting maps live in Admin, not here: this is
 * a read-first list for finding a value stream, not managing the set of them. */
export default function MapListPage() {
  const navigate = useNavigate()
  const { data: maps, isLoading } = useMaps()

  const portfolios = useMemo(() => {
    const set = new Set<string>()
    for (const m of maps ?? []) set.add(m.portfolio ?? NO_PORTFOLIO)
    return [...set].sort((a, b) =>
      a === NO_PORTFOLIO ? 1 : b === NO_PORTFOLIO ? -1 : a.localeCompare(b),
    )
  }, [maps])

  // Track which portfolios are *hidden*. Everything else is shown — so a portfolio that shows
  // up for the first time is visible by default, with no effect needed to seed it.
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  function toggle(p: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const rows = (maps ?? [])
    .filter((m) => !hidden.has(m.portfolio ?? NO_PORTFOLIO))
    .sort(
      (a, b) =>
        (a.portfolio ?? '~').localeCompare(b.portfolio ?? '~') ||
        (a.project ?? '~').localeCompare(b.project ?? '~') ||
        a.name.localeCompare(b.name),
    )

  return (
    <div className="vsm-page">
      <div className="vsm-page__toolbar">
        <h1 className="vsm-page__title">Value Stream Maps</h1>
      </div>

      <p className="vsm-page__intro">
        Every value stream the tool tracks, filed under its portfolio and project. Click a row
        for its BLUF — the executive summary.
      </p>

      {portfolios.length > 1 && (
        <div className="vsm-checkbox-filter">
          <span className="vsm-checkbox-filter__label">Portfolio</span>
          {portfolios.map((p) => (
            <label key={p} className="vsm-checkbox-filter__option">
              <input type="checkbox" checked={!hidden.has(p)} onChange={() => toggle(p)} />
              {p === NO_PORTFOLIO ? 'No portfolio' : p}
            </label>
          ))}
        </div>
      )}

      {isLoading && <div className="vsm-loading">Loading maps…</div>}

      {!isLoading && (maps?.length ?? 0) === 0 && (
        <div className="vsm-empty">
          No value stream maps yet — create one from ⚙ Admin, or clone a scaffold from the Map
          Library.
        </div>
      )}

      {!isLoading && (maps?.length ?? 0) > 0 && rows.length === 0 && (
        <div className="vsm-empty">No maps match the selected portfolio(s).</div>
      )}

      {rows.length > 0 && (
        <table className="vsm-table">
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>Project</th>
              <th>Value stream</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.id}
                className="vsm-table__row--clickable"
                onClick={() => navigate(`/maps/${m.id}/bluf`)}
              >
                <td>{m.portfolio ?? <span className="vsm-table__muted">—</span>}</td>
                <td>{m.project ?? <span className="vsm-table__muted">—</span>}</td>
                <td className="vsm-table__strong">{m.name}</td>
                <td className="vsm-table__desc">
                  {m.description ?? <span className="vsm-table__muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
