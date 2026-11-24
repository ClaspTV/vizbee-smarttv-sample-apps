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
node perf-long.js --platform <p> [--sender]              # long run: 10 min home + 4 x 10 min playback per case
node --test && npm run check                             # unit tests + type-check (npm install here first)
```

Tizen: `TIZEN_IP=<ip> VZB_APP_ID=<pkg.app>`. Sender: `PERF_TV_NAME="<TV name>"`
(+ optional `PHONE_SERIAL`). Local SDK build: `PERF_SDK_DIR=<SDK repo>/dist/npm`.

Full guide: `docs/performance-e2e.md`; run playbook: `.claude/skills/smarttv-perf/SKILL.md`.
