import { Link } from 'react-router-dom'
import './SplashPage.css'

/** The landing page: what Value Stream is and how to get real value out of it. Absorbed the
 * old standalone "Theory of Operation" page — one place for "what is this and why," reached
 * from the brand text in the nav, rather than a separate route competing with the map list. */
export default function SplashPage() {
  return (
    <div className="splash-page">
      <div className="splash-page__toolbar">
        <h1 className="splash-page__title">Value Stream</h1>
      </div>

      <div className="splash-page__content">
        <section className="splash-section">
          <p className="splash-section__lede">
            Value Stream turns a process — Design → Procure → Build → Ship, or any sequence of
            steps — into a map with real numbers: how long each step actually takes to do the
            work, and how long the gaps between steps actually take to wait. The two are tracked
            separately on purpose, because wait time is usually the bigger number and the one
            nobody can see. Critical path, capacity bottleneck, dominant delay, slip
            amplification — everything else in this app exists to make that gap time visible and
            actionable, not to be a diagram for its own sake.
          </p>
          <p className="splash-section__lede">
            If you already know all that, <Link to="/maps">Value Stream Maps</Link> and{' '}
            <Link to="/library">Map Library</Link> in the nav above are where the work happens.
          </p>
        </section>

        <section className="splash-section">
          <h2 className="splash-section__title">How it works</h2>
          <ul className="splash-list splash-list--plain">
            <li>
              <strong>Steps</strong> (process boxes) carry human + machine processing time and
              operator / machine counts.
            </li>
            <li>
              <strong>Connectors</strong> carry the wait / queue / transport time between steps
              — this is what lets a map branch (two parallel procurement paths joining at
              assembly) while still computing a correct lead time for the whole flow.
            </li>
            <li>
              The backend runs a full <strong>Critical Path Method</strong> pass over the
              graph on every read, so lead time, process cycle efficiency, and the critical
              path are always live, never manually maintained.
            </li>
            <li>
              The <strong>throughput bottleneck</strong> (the single slowest processing step)
              is reported separately from the <strong>critical path</strong> (the longest
              total-time path) — they often aren't the same step, and knowing that is the point.
            </li>
          </ul>
        </section>

        <section className="splash-section">
          <h2 className="splash-section__title">Three horizons of value</h2>
          <div className="splash-grid">
            <div className="splash-card">
              <div className="splash-card__label">During execution</div>
              <div className="splash-card__heading">Manage the critical path</div>
              <p className="splash-card__body">
                While a project's running, BLUF is the PM's dashboard: lead time, the current
                bottleneck, the single biggest wait, and which waits are inside your control
                versus outside it. Use it to decide where to intervene this week — not to
                admire a diagram.
              </p>
            </div>
            <div className="splash-card">
              <div className="splash-card__label">At closeout</div>
              <div className="splash-card__heading">Capture what actually happened</div>
              <p className="splash-card__body">
                When a project wraps, the finished map is the lessons-learned artifact — not a
                memory of how it felt, but a record of where the time actually went, like the
                one-day approval that quietly cost three weeks of foundry lead time. A far
                better input to the next kickoff than a retro six months later.
              </p>
            </div>
            <div className="splash-card">
              <div className="splash-card__label">At the portfolio level</div>
              <div className="splash-card__heading">Decide where to spend</div>
              <p className="splash-card__body">
                Across many closed-out maps, patterns emerge: the same kind of step keeps
                showing up as the bottleneck, or the same category of wait keeps dominating.
                That's the signal for where investment actually pays off — hire into a real
                capacity constraint, fix a chronically slow process, or automate a step that's
                slow because it's repetitive. Money spent anywhere else is a guess.
              </p>
            </div>
          </div>
        </section>

        <section className="splash-section splash-section--caution">
          <h2 className="splash-section__title">⚠ But don't optimize a broken process</h2>
          <p className="splash-section__body">
            Before spending on any of the above, run the fix through a cheap filter first —
            borrowed from Elon Musk's engineering process, sometimes called "the algorithm":
          </p>
          <ol className="splash-list">
            <li>
              <strong>Question the requirement.</strong> Every requirement traces back to a
              person or a policy, and people are sometimes wrong — even smart ones. Don't
              assume a wait or a sign-off is load-bearing just because it's always been there.
            </li>
            <li>
              <strong>Try to delete it.</strong> If a step, an approval, or a hand-off can be
              removed entirely, that beats making it faster. This app's wait contributors and
              slip-amplification warnings are exactly the list to start from.
            </li>
            <li><strong>Simplify what's left</strong> — only after you've tried to delete it.</li>
            <li><strong>Speed it up.</strong> Shrink the cycle time.</li>
            <li>
              <strong>Automate it — last, not first.</strong> Automating a step that shouldn't
              exist just makes the mistake faster and harder to remove later.
            </li>
          </ol>
          <p className="splash-section__body">
            A step that shows up here as a Dominant Delay or a slip-amplification risk is a
            great candidate for steps 1 and 2 — question it, then try to delete it — before
            it's a great candidate for step 5.
          </p>
        </section>

        <section className="splash-section">
          <h2 className="splash-section__title">Mechanics, briefly</h2>
          <ul className="splash-list splash-list--plain">
            <li>
              File a map under a portfolio and project, or clone one from the{' '}
              <Link to="/library">Map Library</Link> to start from a known-good scaffold.
            </li>
            <li>
              Add a step for each stage of work; set its human and machine processing time and
              how many operators / machines it takes.
            </li>
            <li>
              Connect steps with an edge; set the wait time between them, an optional label,
              and whether that wait is internal (your org controls it) or external.
            </li>
            <li>
              Expand a step into its own sub-process map when a stage deserves a value stream
              of its own — its metrics roll up into the parent automatically.
            </li>
            <li>
              BLUF is where every map lands — the executive summary. Edit Map is where you
              build or adjust the model. Toggle between them any time.
            </li>
            <li>
              Ask the chat pane about the map — it reasons from the same numbers, framed the
              same way.
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
