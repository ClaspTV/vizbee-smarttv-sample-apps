---
name: smarttv-perf
description: Measure the Vizbee JS SDK's cost in CPU and memory on smart-TV web platforms (Vizio, LG webOS, Samsung Tizen) - on the home page (idle) and during video playback - in three cases (without Vizbee, with Vizbee and no sender connected, with Vizbee and a phone sender connected), using the elementless npm SDK variant, and produce report.pdf (numbers), analysis.pdf (findings by criticality), issues.pdf (findings by metric) and deep-dive PDFs (cpu, memory - by function and source line). Web vitals (FCP/LCP/TTFB) are captured directly in-page over CDP (a render proxy on platforms like Vizio that emit no native paint/LCP). Use when asked to run perf, measure SDK overhead, compare with/without Vizbee, or profile CPU/memory for the sample web app.
---

# Smart TV perf: CPU + memory (Vizbee JS SDK)

Everything lives in `perf/` (isolated tooling, its own package.json — never touches
the app lockfile). Capture is one transport — Chrome DevTools Protocol — across all
platforms; only the attach differs. Guide: `docs/performance-e2e.md`.

| | |
|---|---|
| Metrics | CPU (main-thread), memory, web vitals (FCP/LCP/TTFB captured in-page over CDP; render proxy where no native paint/LCP). |
| Cases | Without Vizbee · With Vizbee (no sender) · With Vizbee (sender connected) |
| Phases | Home/idle 180s · Playback 180s (hash deep-link, no casting) |
| Variant | Elementless npm SDK (`@vizbeetv/sdk/<plat>-el`) |
| Platforms | Vizio (validated) · webOS · Tizen (adapters present, need on-device validation) |

**Never ask the user anything once asked to run, and do not stop the run.** Dead
streams are dropped in preflight; a run uses whatever streams respond.

## How capture works

- **CPU**: `Performance.getMetrics().TaskDuration`, delta / wall per 5s sample. A
  main-thread proxy (not full-process %), but consistent across cases so it cancels
  in the cost. Deep dive uses the `Profiler` domain (unminified build → real names).
- **Memory**: `Performance.getMetrics().JSHeapUsedSize`, averaged over the **last 60s**
  of each phase (playback buffers for ~2 min; a whole-phase avg measures buffering).
  Deep dive uses `HeapProfiler` allocation sampling.
- **Costs**: SDK = no-sender − without; Sender = sender − no-sender, as the **median
  of paired per-video run differences** (never median − median).

The "without Vizbee" build is the same bundle with continuity init gated off
(`VZB_ENABLED=false` → Vite define). Grafana and HomeSSO stay constant, so they
cancel. Repo is never modified.

## 1. Preflight

```
cd perf && node perf-e2e.js --check [--platform vizio|webos|tizen]
```
Must end with `preflight OK`. On failure tell the user what printed:

| Failure | Fix (user) |
|---|---|
| Vizio UNREACHABLE | Open the app on the TV (debug port :9555 is only up while a page runs) |
| streams DOWN | transient; the run drops them and uses the rest |
| (webOS) ares-inspect not found | `npm i -g @webosose/ares-cli`, set the device |
| (Tizen) sdb not found | install Tizen Studio CLI; connect the TV |

## 2. Run (background)

| User asks | Command | PDFs |
|---|---|---|
| "run perf" (default, Vizio) | `cd perf && node perf-all.js` | report + deep (cpu, memory) + analysis + issues |
| "run perf quick" | `cd perf && node perf-e2e.js` | report only |
| "why / what is taking CPU or memory" | `cd perf && node perf-deep.js` | cpu.pdf + memory.pdf |

Full run: 3 cases × 3 runs × (180s home + 180s playback) ≈ 35–40 min.

Options (env / flags):
- `--platform vizio|webos|tizen` (default vizio)  ·  `--es6` (ES6 module)  ·  `--sender` (adds the sender case)
- `PERF_RUNS=N`  ·  `PERF_HOME_MS` / `PERF_PLAY_MS` (ms)  ·  `VIZIO_IP=<ip>`
- `PERF_PROFILE_MS` (deep-dive profile length)

## 3. Outputs

Written to `perf/perf-results/vizbee-sdk-perf-<run-date>/<platform>/` (meaningful, per-platform):
- `report.pdf` — a **Device & run** table at the top (model, firmware/OS, board, screen, SDK variant, run date), then numbers (metric × case + costs), per-run table, tools used, method
- `device.json` — captured device details (Vizio over CDP, webOS via `ares-device -i`, Tizen via `sdb capability`); the report reads this; edit it to correct/add fields
- `summary.md`, `results.json` — same numbers
- `samples.jsonl` — every raw sample incl. the `vitals` phase (rebuild any report: `node perf-report.js <dir>` — it reads `device.json` and derives the run date from sample timestamps)
- `deep/cpu.pdf`, `deep/memory.pdf` (+ cpu.json, heap.json)
- `analysis.pdf`, `issues.pdf` — from a `findings.json` you add to the run dir
  (see `perf/findings.example.json`); then `node perf-findings.js <dir>`

## 4. Platforms & the sender case

- **Vizio** is validated end-to-end (attach on `:9555`).
- **webOS / Tizen** use the same capture; their device adapters
  (`perf/lib/device/webos.js`, `tizen.js`) follow ares-cli / sdb mechanics but are
  marked UNTESTED — validate the inspector attach on a real TV, then set
  `validated:true` in `perf/lib/platforms.js`.
- **Sender case** (`--sender`) needs an Android phone with the Vizbee demo app over
  adb (`perf/lib/phone.js`); the connect step is a stub to fill in on-device.

## Issues to look for (JS equivalents of the Roku findings)

- Polling the `<video>` element / player on a timer instead of listening to its
  events (CPU).
- A new fetch/WebSocket per message instead of reusing one (memory).
- Logger building strings even when logging is off (CPU).
- Home-page CPU rising with a sender connected — monitor/state running every loop
  instead of on change.

Record each as a finding in `findings.json`: id, title (with the number),
criticality (HIGH/MEDIUM/LOW/INFO), owner, status, per-run values, cause (file:line),
risk, fix.
