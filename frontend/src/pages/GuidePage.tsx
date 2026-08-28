import { useNavigate } from 'react-router-dom'
import './GuidePage.css'

/** App-level explainer, not tied to any one map — what this tool is for and how to get real
 * value out of it across a project's lifecycle. Lives at its own route so it doesn't compete
 * with the map list for space, same "full page, own route" pattern as BLUF. */
export default function GuidePage() {
  const navigate = useNavigate()

  return (
    <div className="guide-page">
      <div className="guide-page__toolbar">
        <button className="guide-page__back" onClick={() => navigate('/')}>
          ← Maps
        </button>
        <h1 className="guide-page__title">Theory of Operation</h1>
      </div>

      <div className="guide-page__content">
        <section className="guide-section">
          <p className="guide-section__lede">
            Value Stream turns a process — Design → Procure → Build → Ship, or any sequence of
            steps — into a map with real numbers: how long each step actually takes to do the
            work, and how long the gaps between steps actually take to wait. The two are tracked
            separately on purpose, because wait time is usually the bigger number and the one
            nobody can see. Critical path, capacity bottleneck, dominant delay, slip
            amplification — everything else in this app exists to make that gap time visible and
            actionable, not to be a diagram for its own sake.
          </p>
        </section>

        <section className="guide-section">
          <h2 className="guide-section__title">Three horizons of value</h2>
          <div className="guide-grid">
            <div className="guide-card">
              <div className="guide-card__label">During execution</div>
              <div className="guide-card__heading">Manage the critical path</div>
              <p className="guide-card__body">
                While a project's running, BLUF is the PM's dashboard: lead time, the current
                bottleneck, the single biggest wait, and which waits are inside your control
                versus outside it. Use it to decide where to intervene this week — not to admire
                a diagram.
              </p>
            </div>
            <div className="guide-card">
              <div className="guide-card__label">At closeout</div>
              <div className="guide-card__heading">Capture what actually happened</div>
              <p className="guide-card__body">
                When a project wraps, the finished map is the lessons-learned artifact — not a
                memory of how it felt, but a record of where the time actually went, like the
                one-day approval that quietly cost three weeks of foundry lead time. That's a
                far better input to the next project's kickoff than a retro conversation six
                months later.
              </p>
            </div>
            <div className="guide-card">
              <div className="guide-card__label">At the portfolio level</div>
              <div className="guide-card__heading">Decide where to spend</div>
              <p className="guide-card__body">
                Across many closed-out maps, patterns emerge: the same kind of step keeps
                showing up as the bottleneck, or the same category of wait keeps dominating.
                That's the signal for where investment actually pays off — hire into a real
                capacity constraint, fix a chronically slow process, or build an AI-assisted
                workflow for a step that's slow because it's repetitive, not because it's hard.
                Money spent anywhere else is a guess.
              </p>
            </div>
          </div>
        </section>

        <section className="guide-section guide-section--caution">
          <h2 className="guide-section__title">⚠ But don't optimize a broken process</h2>
          <p className="guide-section__body">
            Before spending on any of the above, run the fix through a cheap filter first —
            borrowed from Elon Musk's engineering process, sometimes called "the algorithm":
          </p>
          <ol className="guide-list">
            <li>
              <strong>Question the requirement.</strong> Every requirement traces back to a
              person or a policy, and people are sometimes wrong — even smart ones. Don't assume
              a wait or a sign-off is load-bearing just because it's always been there.
            </li>
            <li>
              <strong>Try to delete it.</strong> If a step, an approval, or a hand-off can be
              removed entirely, that beats making it faster. This app's wait contributors and
              slip-amplification warnings are exactly the list to start from when asking "does
              this need to exist at all?"
            </li>
            <li>
              <strong>Simplify what's left</strong> — only after you've tried to delete it.
            </li>
            <li>
              <strong>Speed it up.</strong> Shrink the cycle time.
            </li>
            <li>
              <strong>Automate it — last, not first.</strong> Automating, or building an
              AI-assisted workflow around, a step that shouldn't exist just makes the mistake
              faster and harder to remove later.
            </li>
          </ol>
          <p className="guide-section__body">
            A step that shows up here as a Dominant Delay or a slip-amplification risk is a
            great candidate for steps 1 and 2 — question it, then try to delete it — before it's
            a great candidate for step 5.
          </p>
        </section>

        <section className="guide-section">
          <h2 className="guide-section__title">Mechanics, briefly</h2>
          <ul className="guide-list guide-list--plain">
            <li>Create a map, or duplicate one to start from a known-good template.</li>
            <li>
              Add a step for each stage of work; set its human and machine processing time and
              how many operators/machines it takes.
            </li>
            <li>
              Connect steps with an edge; set the wait time between them, an optional label, and
              whether that wait is internal (your org controls it) or external (it doesn't).
            </li>
            <li>
              Expand a step into its own sub-process map when a stage deserves a value stream of
              its own — its metrics roll up into the parent automatically.
            </li>
            <li>
              BLUF is where every map lands — the executive summary. Edit Map is where you build
              or adjust the model. Toggle between them any time.
            </li>
            <li>
              Ask the chat pane about the map — it reasons from the same numbers laid out above,
              framed the same way.
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
