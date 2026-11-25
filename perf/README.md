# Vizbee SDK perf harness (smart TV)

Measures what the Vizbee JS SDK (npm elementless variant) costs a TV app in
**CPU** and **memory**, on **home/idle** and **playback**, in three cases:

- **without Vizbee** — SDK stripped at build time (baseline)
- **with Vizbee, no sender** — SDK in the app, no phone connected
- **with Vizbee, sender connected** — Android Vizbee demo app paired for the run

Costs: SDK = (no sender) − (without) · Sender = (sender) − (no sender), as paired
per-video medians. Web vitals (FCP/LCP/TTFB) are captured in-page over CDP.

Isolated tooling: its own `package.json`, never touches the app lockfile.

## Capture

One transport — **Chrome DevTools Protocol** — across all platforms; only the
attach differs (Vizio `:9555`, webOS `ares-inspect`, Tizen `sdb`). All three are
validated on-device (Tizen on a 2019 TV, Tizen 5.0 / Chromium 63).

| Metric | Source |
|--------|--------|
| CPU (main-thread) | `Performance.getMetrics().TaskDuration`, Δ ÷ wall per 5s sample |
| Memory | `Performance.getMetrics().JSHeapUsedSize`, avg of last 60s of each phase |
| Deep dive | `Profiler` (CPU) + `HeapProfiler` (allocation), per-function/line |

CPU is a **main-thread** proxy, not full-process %, but it is consistent across
cases so it cancels in the cost differences.

## Usage

```bash
node perf-e2e.js --check --platform vizio|webos|tizen   # preflight
node perf-all.js --platform <p> [--sender]               # full run: numbers + deep dive + findings
node perf-long.js --platform <p> [--sender]              # long run: 10 min home + 4 x 10 min playback per case; report + analysis + issues
MUX_ENV_KEY=<key> node perf-long.js --platform <p> --mux # long run, three-way: baseline · Only Mux · Vizbee+sender (Vizbee cost + Mux cost)
node perf-report.js <run dir> [--platform <p>]           # rebuild report.pdf + external/ from a saved run
node perf-external.js <run dir> [--sdk-label "<label>"]  # (re)write the shareable external/ folder only
node --test && npm run check                             # unit tests + type-check (npm install here first)
```

Output: `perf-results/<cases>_<platform>_<mmddyyyy>/` (e.g. `no-vizbee+vizbee+vizbee-sender_vizio_11252026`).
Each `report.pdf` gives CPU and memory as **average, p95 and peak** and ends with a
per-metric **Measurement tools** table. Every run also writes `<run dir>/external/`
— the customer-shareable subset (`report.pdf`, `summary.md`, `comparison.csv`,
`data/`), stripped of local paths, device IP/serial and runner internals; share only
that folder. Override the SDK name shown there with `--sdk-label`.

Tizen: `TIZEN_IP=<ip> VZB_APP_ID=<pkg.app>`. Sender: `PERF_TV_NAME="<TV name>"`
(+ optional `PHONE_SERIAL`). Local SDK build: `PERF_SDK_DIR=<SDK repo>/dist/npm`.

Full guide: `docs/performance-e2e.md`; run playbook: `.claude/skills/smarttv-perf/SKILL.md`.
