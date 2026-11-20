# Vizbee SDK perf harness (smart TV)

Measures what the Vizbee JS SDK (npm elementless variant) costs a TV app in
**CPU** and **memory**, on **home/idle** and **playback**, in three cases:

- **without Vizbee** — SDK stripped at build time (baseline)
- **with Vizbee, no sender** — SDK in the app, no phone connected
- **with Vizbee, sender connected** — Android Vizbee demo app paired for the run

Costs: SDK = (no sender) − (without) · Sender = (sender) − (no sender), as paired
per-video medians. Web vitals (FCP/LCP/...) are read from Grafana, not re-captured.

Isolated tooling: its own `package.json`, never touches the app lockfile.

## Capture

One transport — **Chrome DevTools Protocol** — across all platforms; only the
attach differs (Vizio `:9555`, webOS `ares-inspect`, Tizen `sdb`).

| Metric | Source |
|--------|--------|
| CPU (main-thread) | `Performance.getMetrics().TaskDuration`, Δ ÷ wall per 5s sample |
| Memory | `Performance.getMetrics().JSHeapUsedSize`, avg of last 60s of each phase |
| Deep dive | `Profiler` (CPU) + `HeapProfiler` (allocation), per-function/line |

CPU is a **main-thread** proxy, not full-process %, but it is consistent across
cases so it cancels in the cost differences.

## Status

Scaffold: `lib/cdp.js`, `lib/metrics.js`, `lib/device/vizio.js`, `perf-smoke.js`.

```bash
# smoke test against a running Vizio app (reads the deployed build; no build/deploy)
VIZIO_IP=10.0.0.141 node perf-smoke.js

# type-check (needs: npm install here first)
npm run check
```

Next: staged-copy "without Vizbee" build, 3-case runner, report/PDF, findings,
then webOS + Tizen device adapters.
