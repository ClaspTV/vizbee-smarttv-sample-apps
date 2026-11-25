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
| Phases | Home/idle 180s · Playback 180s (fresh deep-link load of `#/player/<id>`, no casting) |
| Variant | Elementless npm SDK (`@vizbeetv/sdk/<plat>-el`) |
| Platforms | Vizio · LG webOS · Samsung Tizen (all validated; Tizen on a 2019 UN49RU8000, Tizen 5.0 / Chromium 63) |

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
- **Dropped frames** (playback quality, the web equivalent of the Roku decoderStats
  metric): `HTMLVideoElement.getVideoPlaybackQuality()`
  (`droppedVideoFrames / totalVideoFrames`), read at the end of each playback — works on
  **all** engines including webOS 4 (Chrome 42+).

**Per-engine capture** — the long run auto-detects what the webview provides, and the
report's **"Measurement tools"** section names the actual source per metric:
- Modern engines (Vizio, webOS 5+, Tizen 5+) have the CDP `Performance` domain → CPU
  from `TaskDuration`, retained heap from `JSHeapUsedSize` (used / peak / leak-slope).
- **webOS 4 (Chromium 53)** has **no `Performance` domain and no console-event delivery**,
  and `performance.memory` / `Runtime.getHeapUsage` are stubbed/absent, so the harness
  falls back:
  - **CPU** ← `Profiler` domain (sampling profile, idle-excluded busy %)
  - **Memory allocated** ← `HeapProfiler` sampling allocation profiler (bytes/phase — a
    churn signal, not retained heap; the SDK's extra allocation is the cost)
  - **Retained heap / leak-slope** → `n/a` (full heap snapshots hang — not viable)
  - **VST + phase readiness** ← polled over `Runtime.evaluate` (not console markers)
  - For retained-heap + leak-slope fidelity, run the measurement on **Vizio**.

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
| (Tizen) sdb not found | install Tizen Studio CLI (`~/tizen-studio/tools`); connect the TV |
| (Tizen) UNREACHABLE | TV IP changed (DHCP): scan the LAN for port 26101 and set `TIZEN_IP`; app not installed / wrong `VZB_APP_ID`; app signed with an expired certificate (re-sign with a valid profile and reinstall) |
| port 4190 in use | a stale `vite preview` from an interrupted run: `pkill -f "vite preview --outDir dist/_perf"` (serving uses `--strictPort`, so it fails instead of silently serving an old build) |

## 2. Run (background)

| User asks | Command | PDFs |
|---|---|---|
| "run perf" (default, Vizio) | `cd perf && node perf-all.js` | report + deep (cpu, memory) + analysis + issues |
| "run perf quick" | `cd perf && node perf-e2e.js` | report only |
| "why / what is taking CPU or memory" | `cd perf && node perf-deep.js` | cpu.pdf + memory.pdf |
| "mux perf / cost of Mux" (no Vizbee; without-Mux vs with-Mux) | `cd perf && MUX_ENV_KEY=<key> node perf-mux.js [--platform vizio\|webos\|tizen]` | report (Mux cost) |
| "long run / long playback / 4 x 10 min / memory leak over playback" | `cd perf && node perf-long.js --platform webos [--sender]` | report + analysis + issues (long) |
| "long run: baseline vs Only Mux vs Vizbee+sender / Vizbee vs Mux cost over a long playback" | `cd perf && MUX_ENV_KEY=<key> node perf-long.js --platform webos --mux` | report (Vizbee cost + Mux cost) + analysis + issues |

Full run: 3 cases × 3 runs × (180s home + 180s playback) ≈ 35–40 min (Vizio);
≈ 65 min on Tizen (slower debug-launch and builds).

Standard-run phase timing is identical across cases: sampling starts at the
`[VZBPERF] app launched` marker (home) and at playback start (play). In the sender
case the phone connects **inside** that window (started right after the first sample),
so the connect is part of the sender cost and no case skips the launch work. Playback
start = the `[VZBPERF] video playing` marker **or** the `<video>` clock passing 1s,
whichever comes first (some engines never fire `playing` with the SDK loaded, e.g.
2019 Tizen); 90s timeout.

Long run (`perf-long.js`): one built+served variant per case, then — per case —
a warm-up playback, **10 min home** (`--idle 600`), then **4 playbacks of 10 min**
(`--play 600 --plays 4`), each followed by 30s home (`--after 30`), about 55 min per
case. The leak signals are the per-playback **heap slope (MB/min)** over each 10-min
playback and the **memory-by-playback progression** across the 4 playbacks.

**Cases.** By default the long run measures `nosender` (With Vizbee, no sender)
and `without` (baseline); `--sender` prepends the sender case. The report's cost
columns are then **SDK cost** (`nosender − without`) and **Sender cost**
(`sender − nosender`). **`--mux`** switches to the three-way add-on comparison —
**Without Vizbee & Mux (baseline) · Only Mux · With Vizbee (sender connected)** —
and the report shows **Vizbee cost** (`sender − baseline`) and **Mux cost**
(`mux − baseline`), each add-on measured against the same baseline. The "Only Mux"
case builds with `MUX_ENABLED=true` and no Vizbee (mux-embed monitoring the player);
set `MUX_ENV_KEY=<your Mux Data env key>` so it sends data (without it the cost is
still measured but no data is sent). This is **platform-agnostic** — it builds via
`platform.mode`, so `--mux` runs as-is on `--platform vizio | webos | tizen`.
Any case subset also works directly, e.g. `--cases without,mux,sender` or
`--cases mux` (valid keys: `without | nosender | sender | mux`).

**After each video session** the 30 s home phase (`--after`) captures **all idle
metrics** (CPU, memory used/peak/allocated, heap slope, DOM nodes), so every session
is checked on return to home. **After the last playback**, the **sender case**
disconnects the phone, confirms it is no longer connected (phone cast state), forces a
GC, and measures a home phase (`--disc-idle`, default 120 s) — the **return-to-normal
check**: a "Sender disconnect" table in report.pdf shows _with sender_ vs _after
disconnect_ (**Released** = the within-case drop, the clean signal) and, when a
`nosender` case is in the run, _Residual vs the no-sender level_ ("back to normal" or
"still above"). In a `--mux` run there is no `nosender` case, so the within-case
**Released** column still answers "did CPU/memory come back", but for a clean cross-case
verdict add `nosender` (plain `--sender`, or `--cases without,nosender,sender,mux`).

**Single session (no reloads) — required.** Phases move home↔player **in-page**
through the app router (`window.__perf.router`, exposed only when the build is
compiled with `PERF_HOOKS=true`), so the JS heap carries across playbacks like the
Roku long run. **The `ship:*:npm:*` scripts bake `PERF_HOOKS=true` into the hosted
builds** for exactly this reason — the TV loads the hosted build, so the hook must
be in it. If the loaded build lacks the hook the long run **aborts immediately**
(before the multi-hour phases) with a message to redeploy with `PERF_HOOKS=true`;
pass `--allow-reload` to run anyway (full reloads re-initialise the SDK each phase,
which **inflates post-reload home CPU** — a measurement artifact, not an SDK cost —
and breaks single-session memory). Long VODs (`LONG_VIDEOS` in `lib/cases.js`,
also in `src/data/videos.ts` so the `#/player/<id>` deep-link resolves): WWDC 2015
(34 min) primary, WWDC 2017 (103 min) fallback. `--dry-run` ≈ 5 min; `--report <dir>`
rebuilds report.pdf/summary.md **and analysis.pdf/issues.pdf** from `results.json`.
Default platform is **webos**.
Output: `perf-results/<cases>_<platform>_<mmddyyyy>/` (e.g. `vizbee-sender+mux+no-vizbee_webos_11252026`, plus `_dry-run`; a name already taken gets `-2`, `-3`).

Options (env / flags):
- `--platform vizio|webos|tizen` (default vizio; perf-long defaults to webos)  ·  `--es6` (ES6 module)  ·  `--sender` (adds the sender case)  ·  `--mux` (baseline · Only Mux · Vizbee+sender three-way; with `MUX_ENV_KEY`)  ·  `--cases k,k` (subset of `without,nosender,sender,mux`)  ·  `--disc-idle S` (sender return-to-normal home phase after disconnect, default 120)  ·  `--allow-reload` (run even if the PERF_HOOKS in-page hook is missing — not recommended)
- `PERF_RUNS=N`  ·  `PERF_HOME_MS` / `PERF_PLAY_MS` (ms)  ·  `PERF_PROFILE_MS` (deep-dive profile length)  ·  `PERF_OUT_DIR`
- Device: `VIZIO_IP=<ip>` · `WEBOS_DEVICE=<name>` · Tizen: `TIZEN_IP=<ip>` + `VZB_APP_ID=<pkg.app>` (e.g. `VizbeeSamp.VizbeeTizenSampleApp`)
- Sender: `PERF_TV_NAME="<TV name as the phone's picker shows it>"` (required) · `PHONE_SERIAL` (adb serial; default: first attached device)
- `PERF_SDK_DIR=<SDK repo>/dist/npm` — test a local SDK build (see §5)
- `perf-all.js` forwards its flags (`--platform`, `--sender`, `--es6`, `--cases`) to perf-e2e and perf-deep.
- **Export** env vars when chaining commands (`export X=…; node a.js && node b.js`); a `X=… node a.js && node b.js` prefix only reaches the first command.

## 3. Outputs

Written to `perf/perf-results/<cases>_<platform>_<mmddyyyy>/` (e.g. `no-vizbee+vizbee+vizbee-sender_vizio_11252026`; the SDK measured and run counts are in the report header, not the name; a name already taken gets `-2`, `-3`):
- `report.pdf` — a **Device & run** table at the top (model, firmware/OS, board, screen, SDK variant, run date), then numbers (metric × case + costs — each of CPU and memory reported as **average, p95 and peak**, home and playback), per-run table, a per-metric **Measurement tools** table (each metric → the CDP source → engine), method
- `device.json` — captured device details (Vizio over CDP, webOS via `ares-device -i`, Tizen via `sdb capability`); the report reads this; edit it to correct/add fields
- `summary.md`, `results.json` — same numbers (`results.json` now also carries `kind` and `sdkVariant` so a rebuild/external pass can classify the run)
- `external/` — the **shareable** subset (see §3b)
- `samples.jsonl` — every raw sample incl. the `vitals` phase (rebuild any report: `node perf-report.js <dir>` — it reads `device.json`, derives the run date from sample timestamps, and also rewrites `external/`)
- `deep/cpu.pdf`, `deep/memory.pdf` (+ cpu.json, heap.json)
- `analysis.pdf` (by criticality), `issues.pdf` (by metric) — from a `findings.json`
  you add to the run dir (see `perf/findings.example.json`); then `node perf-findings.js <dir>`.
  **The long run writes both automatically**: it derives a data-grounded draft
  (`findings.auto.json`) by grading each add-on cost (Vizbee cost, Mux cost, ...) per
  metric against thresholds — honest/observational, status `auto-derived - confirm`,
  pointing at `perf-deep.js` to localise. A hand-written `findings.json` in the dir
  overrides the draft (then re-run `node perf-findings.js <dir>`). Thresholds live in
  `perf/lib/long-findings.js`.

### 3b. Sharing with a customer: `<run dir>/external/`

Every run (and every `--report` rebuild) also writes `external/`; **share only that
folder, never the run folder.** It carries:
- `report.pdf`, `summary.md` — the report with internal details removed: no local
  paths, no device IP/serial, no runner internals; the SDK shows as `--sdk-label`
- `comparison.csv` — the report's main table (phase, metric, unit, each case, cost columns), for pasting into a sheet
- `data/samples-<case>.csv` (every 5 s sample: phase, JS heap, DOM nodes), `data/results.json`, `data/README.txt`
- Left out on purpose: `samples.jsonl`, `device.json`, builds, findings/analysis/issues (internal review)
- SDK label: defaults to the SDK variant string; override with `--sdk-label "<label>"` on the run, or `node perf-external.js <run dir> --sdk-label "<label>"` to redo it for an old run
- The write **fails (and names the file)** if an IP, local path or branch name is left in a text file (`lib/external.js` `INTERNAL`)

## 4. Platforms & the sender case

- **Vizio**: attach on `:9555`.
- **LG webOS**: `ares-inspect` (see per-engine capture above for webOS 4).
- **Samsung Tizen** (validated on a 2019 UN49RU8000, Tizen 5.0 / Chromium 63):
  - Attach: `sdb connect $TIZEN_IP` → `sdb shell 0 kill <pkgId>` (a debug-launch hangs
    if the app is already running; `was_kill` is refused on retail images) →
    `sdb shell 0 debug <appId>` (no trailing timeout arg on Tizen 5.0) → `sdb forward`
    → `/json` (retried ~30s: the port is reported before the inspector listens).
    `perf/lib/device/tizen.js` does all of this.
  - The installed app must be debuggable and signed with a **valid** certificate
    profile (an expired one makes `sdb debug` return `closed`).
  - Build: every Tizen case is built with `perf/vite.legacy.config.ts` (chrome63
    target, one bundle, no `@vitejs/plugin-legacy`, `import.meta` rewritten) plus inline
    ES2019 polyfills (`perf/lib/legacy-polyfills.js`). The app's own plugin-legacy split
    half-runs the modern bundle on Chromium 63 and the app never finishes booting. Same
    build for every case, so it cancels in the costs — but absolute Tizen numbers will
    shift if this build setup changes.
- **Sender case** (`--sender` / `--cases sender`) drives an Android phone with the
  Vizbee demo app (`tv.vizbee.demo`) over adb (`perf/lib/phone.js`: UI Automator taps
  the cast icon and the TV named `PERF_TV_NAME`, confirms via logcat). The phone is
  disconnected before each app reload and reconnected after it, and the demo app is
  **force-stopped during the no-sender / without cases** so it cannot auto-reconnect
  and contaminate them. The long run does the same and keeps the phone awake.
- **The phone's Vizbee App ID must match the TV app's**, or the phone cannot pair
  with the TV (they only find each other on the same appId). The TV app's id is
  `vizbeeAppId` in `src/services/config/ConfigService.ts` (default `vzb2057833111`,
  overridable in Settings → stored in localStorage). The phone keeps its id in the
  demo app's shared pref `pref_vizbee_app_id` (read by `phone.js` `appId()`). To sync
  the phone to the TV:
  ```
  adb shell am force-stop tv.vizbee.demo
  adb shell "run-as tv.vizbee.demo sed -i 's/>OLD_ID</>vzb2057833111</' shared_prefs/tv.vizbee.demo_preferences.xml"
  ```
  then relaunch the demo app. Always confirm `phone.appId()` equals the TV's
  `vizbeeAppId` before a sender run.

## 5. Testing a local SDK build

To measure an SDK branch before it is published, build it in the SDK repo and point
the harness at it — `package.json` / `node_modules` are not touched:

```
cd <Vizbee_Generic_App> && npm run build:sdk:npm:tizen:el:es5   # or lgwebos / vizio / xbox
cd <this repo>/perf && PERF_SDK_DIR=<Vizbee_Generic_App>/dist/npm node perf-long.js --platform tizen ...
```

Only the package under test (`VIZBEE_SDK_NPM_PACKAGE`) is aliased to
`$PERF_SDK_DIR/<plat>-el/<es5|es6>/index.js` (Tizen builds; via
`perf/vite.legacy.config.ts`). Local builds report the SDK repo's `package.json`
version, not the release-stamped one — label the report with the branch/commit.
Write each SDK's run to its own `PERF_OUT_DIR` so runs do not overwrite each other.

## 6. Retained-memory check (leak triage)

`JSHeapUsedSize` includes garbage not yet collected, so a rising heap is not proof of
a leak. After a long run the app is still running on the TV: re-attach **without
relaunching** (forward the same inspector port), call `HeapProfiler.collectGarbage`,
then read `Performance.getMetrics` (retained heap, `JSEventListeners`) and count live
objects by type with `Runtime.queryObjects` (e.g. `XMLHttpRequest.prototype`,
`PerformanceObserver.prototype`). Capture the inspector port during the run
(`sdb forward --list`).

## Issues to look for (JS equivalents of the Roku findings)

- Polling the `<video>` element / player on a timer instead of listening to its
  events (CPU).
- A new fetch/WebSocket per message instead of reusing one (memory).
- Logger building strings even when logging is off (CPU).
- Home-page CPU rising with a sender connected — monitor/state running every loop
  instead of on change.
- Retained XHRs paired 1:1 with `PerformanceObserver`s growing with a sender
  connected: XHR-tracing instrumentation (Grafana Faro / OpenTelemetry, New Relic,
  ...) plus PubNub aborting the finished subscribe XHR inside its own
  `readystatechange(4)` callback (load/loadend never fire, so the tracer never
  cleans up). Fixed in the SDK (`src/vtvutils/PubNubXhr.js` skips aborting finished
  requests; used by Tizen / LG / Xbox / Vizio / Chromecast v2 builds) and in this app
  (Faro `ignoreUrls` for PubNub in `src/services/grafana/GrafanaService.ts`).
  Chromecast CAF and the hosted combined builds still use superagent.

Record each as a finding in `findings.json`: id, title (with the number),
criticality (HIGH/MEDIUM/LOW/INFO), owner, status, per-run values, cause (file:line),
risk, fix.
