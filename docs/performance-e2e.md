# Smart TV perf harness (CPU + memory)

Measures what the Vizbee JS SDK (elementless npm variant) costs the sample app in
CPU and memory, on home/idle and during playback, across three cases. Lives in
`perf/` as isolated tooling (own `package.json`, never touches the app lockfile).
Runs on bare Node 22 — no install needed except for `npm run check` (type-check).

## Model

| | |
|---|---|
| Metrics | CPU (main-thread, CDP TaskDuration) · memory (JS heap, last-60s avg) |
| Web vitals | From Grafana (FCP/LCP/...); not re-captured here |
| Cases | without Vizbee · with Vizbee no sender · with Vizbee sender connected |
| Phases | home/idle 180s · playback 180s (hash deep-link into `/player/<id>`) |
| Runs | 3 per case, videos rotated in a fixed order (so run i is paired across cases) |
| Costs | SDK = no-sender − without; Sender = sender − no-sender; median of paired per-video diffs |

## How a case is built

The app is built three ways by env-driven Vite defines — the repo is never patched:

- **without Vizbee**: `VZB_ENABLED=false` → `__VZB_ENABLED__` gates continuity init
  off in `src/app/App.ts`. The SDK chunk is present but never fetched or executed:
  a clean *runtime* baseline. Grafana + HomeSSO stay on in every case, so they cancel.
- **with Vizbee**: `VIZBEE_SDK_NPM_PACKAGE=@vizbeetv/sdk/<plat>-el/<es5|es6>` → the
  elementless SDK is bundled and loaded.
- **sender**: same build as no-sender; differs only by a phone being connected.

Each build is served locally (`vite preview`) and the TV is pointed at the LAN URL
over CDP — no deploy per run.

## How it drives the app

- `[VZBPERF] app launched` (after first render) and `[VZBPERF] video playing` (on the
  `<video>` `playing` event) are logged by the app and read over CDP as phase markers.
- Playback starts in-session by setting `location.hash = '#/player/<id>'` (the router
  listens for `hashchange`) — deterministic, no casting, no reload.

## Capture

One transport (CDP) for every platform; only the attach differs:

| Platform | Attach | Status |
|----------|--------|--------|
| Vizio | `http://<ip>:9555/json` | validated |
| LG webOS | `ares-inspect` → local inspector port | adapter present, needs on-device validation |
| Samsung Tizen | `sdb debug` + `sdb forward` | adapter present, needs on-device validation |

| Metric | CDP |
|--------|-----|
| CPU | `Performance.getMetrics().TaskDuration`, Δ ÷ wall per 5s |
| Memory | `Performance.getMetrics().JSHeapUsedSize`, last-60s avg |
| CPU deep dive | `Profiler` (unminified build → real function names) |
| Memory deep dive | `HeapProfiler` allocation sampling |

CPU is main-thread only (not full-process %), but consistent across cases, so it
cancels in the cost differences.

## Commands

```bash
cd perf
node perf-e2e.js --check              # preflight
node perf-all.js                      # full run: e2e + deep + findings
node perf-e2e.js                      # numbers + report.pdf only
node perf-deep.js [results-dir]       # cpu.pdf + memory.pdf
node perf-report.js <results-dir>     # rebuild report from samples.jsonl
node perf-findings.js <results-dir>   # analysis.pdf + issues.pdf from findings.json
node --test                           # unit tests (report math, memory window)
npm run check                         # type-check (needs `npm install` here once)
```

Flags/env: `--platform vizio|webos|tizen` · `--es6` · `--sender` · `PERF_RUNS` ·
`PERF_HOME_MS` / `PERF_PLAY_MS` · `PERF_PROFILE_MS` · `VIZIO_IP` · `PERF_OUT_DIR`.

## Outputs (`perf/perf-results/<timestamp>/`)

`report.pdf`, `summary.md`, `results.json`, `samples.jsonl`, `deep/{cpu,memory}.pdf`,
and `analysis.pdf` / `issues.pdf` (from a `findings.json` you drop in — template at
`perf/findings.example.json`).

## Module map (`perf/lib/`)

`cdp.js` (transport) · `metrics.js` (sample, cpuPercent, lastWindowAvg) ·
`device/{vizio,webos,tizen,index}.js` (attach) · `build.js` (env-driven variant +
local serve) · `platforms.js` · `cases.js` · `preflight.js` · `runner.js` (phases) ·
`report.js` (math + jsonl loader) · `pdf.js` (zero-dep writer) · `pdf-report.js` ·
`profile.js` (Profiler/HeapProfiler) · `pdf-deep.js` · `findings.js` · `phone.js` (sender).

## Extending

- **New platform**: add to `platforms.js` + a `device/<plat>.js` with the same
  interface (`attach/navigate/reload/reachable/pageTarget/close`).
- **Another SDK (e.g. Mux)**: build a variant that injects it at build time and add a
  case; compare without vs with, no Vizbee.
