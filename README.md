# Value Stream

A visual, interactive value-stream-mapping (VSM) tool. Operators load or create process-flow
maps — e.g. *Design → Procure → Build → Ship* for a hardware part — set wait time, human
processing time, and machine processing time per step, and see exactly where the bottleneck is
and how much of total lead time is actually value-adding work.

Unlike a static VSM diagram, the map is a live calculation: every edit recomputes the critical
path, process cycle efficiency, and the throughput bottleneck (which may not even be on the
critical path — a real, non-obvious finding this tool is built to surface). AI assistance is
optional and off by default — the app is fully usable without it.

## How it works

- **Steps** (process boxes) carry human + machine processing time, operator/machine counts.
- **Connectors** carry wait/queue/transport time between steps — this is what lets a map
  branch (e.g. two parallel procurement paths joining at assembly) while still computing a
  correct lead time for the whole flow.
- The backend runs a full **Critical Path Method (CPM)** pass (forward + backward pass, slack)
  over the map's graph on every read, so lead time, process cycle efficiency, and the critical
  path are always live, not manually maintained.
- The **throughput bottleneck** (Theory of Constraints: the single slowest processing step) is
  reported separately from the **critical path** (the longest total-time path) — they often
  aren't the same step, and knowing that is the point.

## Tech stack

- **Backend**: Python 3.12 / Flask / SQLAlchemy / SQLite (WAL mode), optional Anthropic Claude
  or Ollama for AI-assisted parameter suggestions and narrative bottleneck analysis
- **Frontend**: React + TypeScript, [React Flow](https://reactflow.dev) for the interactive
  canvas, TanStack Query for server state
- Matches the on-prem-friendly, AI-optional posture of this project's sibling app,
  [BurnedValue](https://github.com/matthewnewell/BurnedValue): no AI configured, no outbound
  connections, no accounts required.

## Local development

```bash
# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python app.py            # http://localhost:8080

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                        # http://localhost:5173, proxies /api to :8080
```

A demo map ("Bracket Assembly — Design to Ship") seeds automatically on first run.

Run backend tests: `cd backend && .venv/bin/python -m pytest tests/ -v`

### Configuration

Copy `backend/.env.example` to `backend/.env` to configure AI assistance (`AI_PROVIDER=claude`
or `ollama`). Leave it unset (`none`, the default) to run with AI features off.

## Status

Core mapping, the CPM/bottleneck engine, and AI-assisted parameter suggestions are built and
working. Docker packaging and a production build pipeline are not set up yet.

## License

MIT
