# Smart TV perf harness (CPU + memory)

Measures what the Vizbee JS SDK (elementless npm variant) costs the sample app in
CPU and memory, on home/idle and during playback, across three cases. Lives in
`perf/` as isolated tooling (own `package.json`, never touches the app lockfile).
Runs on bare Node 22 — no install needed except for `npm run check` (type-check).

## Model

| | |
|---|---|
| Metrics | CPU (main-thread, CDP TaskDuration) · memory (JS heap, last-60s avg) |
| Web vitals | FCP/LCP/TTFB captured in-page over CDP (render proxy on platforms with no native paint/LCP, e.g. Vizio) |
| Cases | without Vizbee · with Vizbee no sender · with Vizbee sender connected |
| Phases | home/idle 180s · playback 180s (fresh deep-link load of `#/player/<id>`) |
| Runs | 3 per case, videos rotated in a fixed order (so run i is paired across cases) |
| Costs | SDK = no-sender − without; Sender = sender − no-sender; median of paired per-video diffs |

## How a case is built

The app is built three ways by env-driven Vite defines — the repo is never patched:

- **without Vizbee**: `VZB_ENABLED=false` → `__VZB_ENABLED__` gates continuity init
  off in `src/app/App.ts`. The SDK chunk is present but never fetched or executed:
  a clean *runtime* baseline. Grafana + HomeSSO stay on in every case, so they cancel.
- **with Vizbee**: `VIZBEE_SDK_NPM_PACKAGE=@vizbeetv/sdk/<plat>-el/<es5|es6>` → the
  elementless SDK is bundled and loaded.
- **sender**: same build as no-sender; differs only by a phone being connected
  (Android Vizbee demo app driven over adb, `lib/phone.js`).
- **Tizen** (Chromium 63 on 2019 TVs): every case is built with
  `perf/vite.legacy.config.ts` (chrome63, one bundle, no plugin-legacy) plus inline
  polyfills, so the same build boots on the old engine in every case.
- **Local SDK**: `PERF_SDK_DIR=<SDK repo>/dist/npm` swaps the npm package under test
  for a local SDK build (no `package.json` change).

Each build is served locally (`vite preview --strictPort`, stopped as a process
group so no stale server keeps serving an old build) and the TV is pointed at the LAN
URL over CDP — no deploy per run.

## How it drives the app

- `[VZBPERF] app launched` (after first render) and `[VZBPERF] video playing` (on the
  `<video>` `playing` event) are logged by the app and read over CDP as phase markers.
- Playback starts as a fresh deep-link load of `<url>#/player/<id>` (the router reads
  the launch hash on boot), so every run starts from a clean boot — deterministic, no
  casting. Playback start = the `video playing` marker **or** the `<video>` clock
  passing 1s, whichever is first (2019 Tizen never fires `playing` with the SDK loaded).
- Sampling starts at the same point in every case (launch / playback start). In the
  sender case the phone connects inside the measured window, so its connect is part of
  the sender cost. The demo app is force-stopped during the other cases.

## Capture

One transport (CDP) for every platform; only the attach differs:

| Platform | Attach | Status |
|----------|--------|--------|
| Vizio | `http://<ip>:9555/json` | validated |
| LG webOS | `ares-inspect` → local inspector port | validated |
| Samsung Tizen | `sdb connect` → kill → `sdb shell 0 debug <appId>` → `sdb forward` | validated (2019 UN49RU8000, Tizen 5.0) |

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
node perf-findings.js <results-dir>   # analysis.pdf + issues.pdf from findings.json (or findings.auto.json)
node perf-long.js --platform <p> [--sender]   # long run: 10 min home + 4 x 10 min playback per case
MUX_ENV_KEY=<key> node perf-long.js --platform <p> --mux  # long run three-way: baseline · Only Mux · Vizbee+sender
node --test                           # unit tests (report math, memory window)
npm run check                         # type-check (needs `npm install` here once)
```

Flags/env: `--platform vizio|webos|tizen` · `--es6` · `--sender` · `--mux` · `--cases k,k` · `--disc-idle S` ·
`PERF_RUNS` · `PERF_HOME_MS` / `PERF_PLAY_MS` · `PERF_PROFILE_MS` · `PERF_OUT_DIR` ·
`VIZIO_IP` · `WEBOS_DEVICE` · `TIZEN_IP` + `VZB_APP_ID` (Tizen) · `PERF_TV_NAME` +
`PHONE_SERIAL` (sender) · `PERF_SDK_DIR` (local SDK). `perf-all.js` forwards its flags
to perf-e2e and perf-deep.

## Long run

`perf-long.js`: per case, one build in **one app session** (in-page router nav, so the
heap carries across playbacks): warm-up, 10 min home, then 4 playbacks of 10 min, each
followed by 30s on home (about 55 min per case). Leak signals: per-playback heap slope
and the memory-by-playback progression. Output:
`perf-results/vizbee-sdk-long-<date>/<platform>/`.

After each playback a 30 s home phase captures **all idle metrics** (CPU, memory
used/peak/allocated, heap slope, DOM nodes). After the last playback the **sender case**
disconnects the phone, confirms it, forces a GC and measures a `--disc-idle` (120 s)
home phase — the **return-to-normal check** (a "Sender disconnect" table + verdict in
report.pdf: _Released_ within-case, and _Residual_ vs the no-sender level when a
`nosender` case is present).

Cases: default `nosender` + `without` (cost columns SDK cost, Sender cost); `--sender`
adds the sender case. **`--mux`** runs the three-way add-on comparison — baseline
(Without Vizbee & Mux) · Only Mux (mux-embed, no Vizbee) · Vizbee+sender — and the
report shows **Vizbee cost** (`sender − baseline`) and **Mux cost** (`mux − baseline`),
each against the shared baseline; set `MUX_ENV_KEY` for a real Mux run. Platform-agnostic
(vizio/webos/tizen). Any subset via `--cases` (`without,nosender,sender,mux`). Details
and the retained-memory (forced-GC) check: `.claude/skills/smarttv-perf/SKILL.md`.

## Outputs (`perf/perf-results/vizbee-sdk-perf-<run-date>/<platform>/`)

Folder is meaningful + per-platform (not a raw timestamp). Contents:
`report.pdf` (starts with a **Device & run** table — model, firmware/OS, board, screen,
SDK variant, run date — captured into `device.json`), `summary.md`, `results.json`,
`samples.jsonl` (includes the `vitals` phase), `deep/{cpu,memory}.pdf`, and
`analysis.pdf` / `issues.pdf` (from a `findings.json` you drop in — template at
`perf/findings.example.json`). The **long run writes `analysis.pdf` + `issues.pdf`
automatically**: it grades each add-on cost per metric into a draft
`findings.auto.json` (status `auto-derived - confirm`; thresholds in
`perf/lib/long-findings.js`); a hand-written `findings.json` overrides it.

`device.json` is auto-captured per platform (Vizio over CDP, webOS via `ares-device -i`,
Tizen via `sdb capability`); `node perf-report.js <dir>` reads it and derives the run
date from the sample timestamps when rebuilding a report.

## Module map (`perf/lib/`)

`cdp.js` (transport) · `metrics.js` (sample, cpuPercent, lastWindowAvg) ·
`device/{vizio,webos,tizen,index}.js` (attach) · `build.js` (env-driven variant +
local serve) · `legacy-polyfills.js` + `../vite.legacy.config.ts` (Tizen 5.0 build) ·
`platforms.js` · `cases.js` · `preflight.js` · `runner.js` (phases) ·
`long.js` + `long-report.js` (long run) · `deviceinfo.js` ·
`report.js` (math + jsonl loader) · `pdf.js` (zero-dep writer) · `pdf-report.js` ·
`profile.js` (Profiler/HeapProfiler) · `pdf-deep.js` · `findings.js` · `phone.js` (sender).

## Mux comparison (without Mux vs with Mux)

Measures what **Mux Data (mux-embed) monitoring** costs in CPU + memory — **no Vizbee
SDK in either case**, so Mux is isolated against the pure baseline.

- Build flag `MUX_ENABLED` (Vite define `__MUX_ENABLED__`, plus `__MUX_ENV_KEY__` from
  `MUX_ENV_KEY`). In the "with Mux" build, `src/services/mux/mux.ts` loads mux-embed
  from CDN and calls `mux.monitor(...)` on the player (hls.js or native). The guard
  tree-shakes the whole Mux path out of the "without Mux" build.
- Cases reuse the `without` / `nosender` keys so `costs.sdk` = **Mux cost**
  (with Mux − without Mux, paired per video). The report relabels them "Without Mux" /
  "With Mux" and the cost line "Mux cost".

Run (per platform):

```bash
cd perf
MUX_ENV_KEY=<your Mux Data env key> node perf-mux.js --platform vizio
MUX_ENV_KEY=<your Mux Data env key> node perf-mux.js --platform webos
MUX_ENV_KEY=<your Mux Data env key> node perf-mux.js --platform tizen
```

Output: `perf-results/mux-perf-<run-date>/<platform>/` (report.pdf, results.json,
summary.md, samples.jsonl, device.json). Without `MUX_ENV_KEY` it still runs (measures
mux-embed load + monitor cost) but sends no data to Mux.

## Extending

- **New platform**: add to `platforms.js` + a `device/<plat>.js` with the same
  interface (`attach/navigate/reload/reachable/pageTarget/close`).
- **Another SDK**: mirror the Mux pattern — a build flag + a small service gated on it,
  plus a `perf-<sdk>.js` that builds without/with and reuses the report.
