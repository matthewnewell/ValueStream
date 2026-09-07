import { Link } from 'react-router-dom'
import './SplashPage.css'

// One illustrative value stream, drawn roughly to scale. `w` is px width in the SVG.
const RAW: { kind: 'work' | 'wait'; name?: string; label?: string; dur: string; w: number }[] = [
  { kind: 'work', name: 'Design', dur: '3 days', w: 78 },
  { kind: 'wait', label: 'review', dur: '2 days', w: 44 },
  { kind: 'work', name: 'Procure', dur: '2 days', w: 64 },
  { kind: 'wait', label: 'foundry lead time', dur: '3 weeks', w: 300 },
  { kind: 'work', name: 'Build', dur: '3 days', w: 78 },
  { kind: 'wait', label: 'QA queue', dur: '2 days', w: 44 },
  { kind: 'work', name: 'Ship', dur: '1 day', w: 56 },
]
let _x = 18
const TRACK = RAW.map((s) => {
  const seg = { ...s, x: _x }
  _x += s.w
  return seg
})
const TRACK_END = _x

/** The landing page: what Value Stream is and how to get real value out of it. Absorbed the
 * old standalone "Theory of Operation" page — one place for "what is this and why," reached
 * from the brand text in the nav, rather than a separate route competing with the map list. */
export default function SplashPage() {
  return (
    <div className="splash-page">
      <div className="splash-page__scroll">
        <div className="splash-page__content">
        <header className="splash-hero">
          <h1 className="splash-hero__title">Identify and eliminate bottlenecks</h1>
          <p className="splash-hero__sub">
            Value Stream maps a process to scale — the work in the boxes, the waiting in the
            gaps — and runs the critical-path math to name the one step that sets your pace.
          </p>
          <div className="splash-hero__actions">
            <Link className="splash-btn splash-btn--primary" to="/sample">
              Sample Map
            </Link>
            <Link className="splash-btn splash-btn--ghost" to="/library">
              Map Library
            </Link>
          </div>
        </header>

        <figure className="splash-figure">
          <div className="splash-figure__scroll">
            <svg viewBox="0 0 712 128" role="img" aria-labelledby="vs-timeline-title">
              <title id="vs-timeline-title">
                A value stream drawn to scale — short work steps separated by much longer waits,
                the largest a three-week foundry lead time, inside a four-week lead time.
              </title>
              {TRACK.map((seg, i) =>
                seg.kind === 'work' ? (
                  <g key={i}>
                    <rect
                      x={seg.x}
                      y="24"
                      width={seg.w}
                      height="54"
                      rx="7"
                      fill="var(--color-accent-soft)"
                      stroke="var(--color-accent)"
                      strokeWidth="1.5"
                    />
                    <text
                      className="vs-svg__work-name"
                      x={seg.x + seg.w / 2}
                      y="47"
                      textAnchor="middle"
                    >
                      {seg.name}
                    </text>
                    <text
                      className="vs-svg__work-dur"
                      x={seg.x + seg.w / 2}
                      y="62"
                      textAnchor="middle"
                    >
                      {seg.dur}
                    </text>
                  </g>
                ) : (
                  <g key={i}>
                    <rect
                      x={seg.x}
                      y="54"
                      width={seg.w}
                      height="24"
                      fill="var(--color-wait-soft)"
                      stroke="var(--color-wait)"
                      strokeWidth="1"
                      strokeDasharray="3 2"
                    />
                    <text
                      className="vs-svg__wait"
                      x={seg.x + seg.w / 2}
                      y="69"
                      textAnchor="middle"
                    >
                      {seg.w > 130 ? `${seg.dur} · ${seg.label}` : seg.dur}
                    </text>
                  </g>
                ),
              )}
              <path
                d={`M18 90 L18 94 L${TRACK_END} 94 L${TRACK_END} 90`}
                fill="none"
                stroke="var(--color-text-faint)"
                strokeWidth="1"
              />
              <text
                className="vs-svg__lead"
                x={(18 + TRACK_END) / 2}
                y="112"
                textAnchor="middle"
              >
                Lead time: 4 weeks — 9 days of it is actual work
              </text>
            </svg>
          </div>
          <figcaption className="splash-figure__caption">
            The foundry wait dwarfs every step of real work. Find that, and you've found your
            constraint.
          </figcaption>
        </figure>

        <div className="splash-grid">
          <div className="splash-card">
            <div className="splash-card__label">During planning</div>
            <div className="splash-card__heading">Define the value stream</div>
            <p className="splash-card__body">
              Lay out the steps and the waits before the work starts — or clone a finished map
              from a similar project and adjust it, so you start from a real baseline instead
              of a blank slate.
            </p>
          </div>
          <div className="splash-card">
            <div className="splash-card__label">During execution</div>
            <div className="splash-card__heading">Manage the critical path</div>
            <p className="splash-card__body">
              While a project's running, BLUF is the PM's dashboard: lead time, the current
              bottleneck, the single biggest wait, and which waits are inside your control
              versus outside it. Use it to decide where to intervene this week — not to admire
              a diagram.
            </p>
          </div>
          <div className="splash-card">
            <div className="splash-card__label">At closeout — Lessons learned</div>
            <div className="splash-card__heading">Capture what actually happened</div>
            <p className="splash-card__body">
              When a project wraps, the finished map is the lessons-learned artifact — not a
              memory of how it felt, but a record of where the time actually went, like the
              one-day approval that quietly cost three weeks of foundry lead time. A far better
              input to the next kickoff than a retro six months later.
            </p>
          </div>
          <div className="splash-card">
            <div className="splash-card__label">At the portfolio level</div>
            <div className="splash-card__heading">Decide where to spend</div>
            <p className="splash-card__body">
              Across many closed-out maps, patterns emerge: the same kind of step keeps showing
              up as the bottleneck, or the same category of wait keeps dominating. That's the
              signal for where investment actually pays off — hire into a real capacity
              constraint, fix a chronically slow process, or automate a step that's slow
              because it's repetitive.
            </p>
          </div>
        </div>

        <section className="splash-section splash-section--caution">
          <h2 className="splash-section__title">⚠ Don't optimize a broken process</h2>
          <p className="splash-section__body">
            Before you spend a dollar making a step faster, run it through five steps, in order:
          </p>
          <ol className="splash-list">
            <li>
              <strong>Question the requirement.</strong> Every requirement traces back to a
              person or a policy, and people are sometimes wrong — even smart ones. Don't
              assume a wait or a sign-off is load-bearing just because it's always been there.
            </li>
            <li>
              <strong>Try to delete it.</strong> Removing a step, an approval, or a hand-off
              beats making it faster. This app's wait contributors and slip-amplification
              warnings are the list to start from.
            </li>
            <li><strong>Simplify what's left</strong> — only after you've tried to delete it.</li>
            <li><strong>Speed it up.</strong> Shrink the cycle time.</li>
            <li>
              <strong>Automate it — last.</strong> Automating a step that shouldn't exist just
              makes the mistake faster and harder to remove.
            </li>
          </ol>
          <p className="splash-section__body">
            A step flagged here as a Dominant Delay or a slip risk is a great candidate for
            steps 1 and 2 long before it's a candidate for step 5.
          </p>
          <figure className="splash-quote">
            <blockquote className="splash-quote__text">
              "The most common error of a smart engineer is to optimize a thing that should
              not exist."
            </blockquote>
            <figcaption className="splash-quote__cite">
              Elon Musk — "the algorithm," SpaceX &amp; Tesla
            </figcaption>
          </figure>
        </section>

        <section className="splash-section">
          <h2 className="splash-section__title">How it works</h2>
          <ul className="splash-list splash-list--plain">
            <li>
              <strong>Steps</strong> are process boxes — human + machine processing time,
              operator / machine counts. <strong>Connectors</strong> carry the wait / queue /
              transport time between them, and let a map branch (parallel paths joining at
              assembly) while still computing one correct lead time.
            </li>
            <li>
              The backend runs a full <strong>Critical Path Method</strong> pass on every read
              — lead time, process cycle efficiency, and the critical path are always live,
              never hand-maintained.
            </li>
            <li>
              The <strong>throughput bottleneck</strong> (slowest single step) is reported
              separately from the <strong>critical path</strong> (longest total-time path) —
              often not the same step, and that's the point.
            </li>
            <li>
              Mark each connector's wait as <strong>internal</strong> (your org controls it —
              approvals, holds) or <strong>external</strong> (vendor, shipping), so BLUF can
              split what's in your hands from what isn't.
            </li>
            <li>
              <strong>File a map</strong> under a portfolio and project, or clone one from the{' '}
              <Link to="/library">Map Library</Link> to start from a known-good scaffold.
            </li>
            <li>
              <strong>Expand a step</strong> into its own sub-process map when a stage deserves
              a value stream of its own — its metrics roll up into the parent automatically.
            </li>
            <li>
              <strong>BLUF</strong> is where every map lands — the executive summary.{' '}
              <strong>Edit Map</strong> is where you build the model; toggle any time. Ask the
              chat pane about the map — it reasons from the same numbers.
            </li>
          </ul>
        </section>
        </div>
      </div>
    </div>
  )
}
