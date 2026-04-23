# Cold-Load And Navigation Latency Roadmap

## Scope

This document is a static latency audit of the current app. It is focused on:

- cold load into the main conflict routes
- perceived latency during SPA navigation
- what is prefetched or precomputed today
- which work is duplicated, deferred, or currently wasted
- what an ideal end state should look like

Inputs for this audit:

- route entry files under `src/routes/`
- shared loaders and caches under `src/lib/`
- worker entry points under `src/workers/`
- a production build run on `2026-04-14` via `npm run build`

This is no longer purely structural. Direct cold-load snapshots for `/conflict`, `/bubble`, and `/tiering` were captured on `2026-04-14` via `npx --yes --package=playwright node ./scripts/verifyNavigation.mjs --report-perf`. Where timings are still missing from code spans, findings below remain structural.

The current local benchmark baseline also now includes a representative route matrix from `npm run lighthouse:matrix` (`docs/lighthouse-summary.md`, generated summaries under `tmp/lighthouse-matrix/`). It is still on Lighthouse `12.8.2` because the local Node version cannot run Lighthouse 13, but it materially changes the priority order: the earlier single-route `1.7s / 1.8s / 0 CLS` story was not representative of a comparable cold mobile pass. The current direct-route bottlenecks are shared/client hydration and still-unattributed client-owned long tasks on `/aava`; the thin route-entry split materially shrank the direct AAvA route node, but it did not isolate the remaining long-task owner. The `/conflict` layout-stability gap is now materially improved and no longer the main open issue.

## Current Strengths

- The app is fully prerendered via `src/routes/+layout.ts`, so route HTML shells are static and navigation does not depend on server-side data fetches.
- `src/app.html` enables `data-sveltekit-preload-data="hover"` and `data-sveltekit-preload-code="hover"`, so route `+page.ts` loaders can start warming before the click.
- `src/routes/bubble/+page.svelte` and `src/routes/tiering/+page.svelte` now expose the direct-entry graph metadata in their own route heads, and `src/app.html` uses that route-owned metadata to add preload hints and start a one-shot compressed-byte prime for the existing versioned `graph_data` URL on direct `/bubble` and `/tiering` entries before route JS boots.
- `src/routes/bubble/+page.svelte` now renders first paint through the route-owned canvas layer in `src/lib/bubbleCanvas.ts`, so direct `/bubble` entry no longer depends on Plotly runtime warm or script ownership.
- Direct graph visible entry no longer needs full `GraphData` on the main thread when the worker path is available: `src/routes/bubble/+page.svelte` and `src/routes/tiering/+page.svelte` now bootstrap first paint from compact route metadata plus a worker-computed initial artifact returned by `src/lib/conflictArtifactRegistry.ts`.
- `src/app.html` no longer loads the legacy polyfill script, Bootstrap JS bundle, Bootstrap Icons font, Halfmoon CSS/theme, or the old global stylesheet link; `src/routes/+layout.svelte` now owns a lean app shell CSS layer, and `src/routes/+page.svelte` alone loads the branded `Chakra Petch` font.
- `src/lib/conflictContext.ts` now has a shared worker fetch+merge path through `src/lib/compositeContextWorker.ts` / `src/workers/compositeContextWorker.ts` when it owns composite payload loading, so composite `/aava` and composite prefetch no longer have to pin merge CPU to the main thread by default.
- `src/routes/aava/+page.svelte` now stays a thin direct-entry shell that owns only the shell CSS/preconnect, a loading placeholder, and a dynamic import of `src/routes/aava/AavaRouteClient.svelte`; the route-local client component still owns context resolution/query sync, `src/lib/aavaGrid.ts` still loads only with visible `DataGrid`, and `$lib/kpi` still loads only with `src/components/KpiBuilderModal.svelte`. Direct `build/aava.html` now modulepreloads only the thin route node instead of the full interactive AAvA controller.
- `src/lib/binary.ts` deduplicates identical payload fetch/decompress work by URL through a shared promise cache.
- `src/routes/bubble/+page.ts` and `src/routes/tiering/+page.ts` now prime compressed graph payload bytes on client load instead of starting a full main-thread graph decode.
- `src/lib/prefetchCoordinator.ts` already deduplicates queued and in-flight prefetches, applies CPU and bandwidth budgets, and blocks idle expensive work on constrained clients.
- `src/lib/grid/DataGrid.svelte` keeps the grid shell mounted, splits bootstrap/query/summary/detail work, and reuses equal page and summary payloads rather than forcing full rerenders.
- The single-conflict table route already has the strongest reuse boundary in the app: `src/lib/conflictGrid/workerClient.ts` keeps a shared worker alive for 60 seconds and caches bootstrap promises by layout.
- `src/lib/conflictArtifactRegistry.ts` now gives bubble and tiering the same kind of shared artifact owner the table route already had: route entry and prefetch resolve through one graph payload key, one shared worker handle per conflict/version, and one set of default-artifact descriptors.
- `src/lib/prefetchArtifacts.ts` now exposes explicit `warmBubbleRouteArtifacts(...)` / `warmTieringRouteArtifacts(...)` bundles, and `src/lib/prefetchCoordinator.ts` now keeps shared graph-payload work promotable from either graph destination even when the first queued task came from the other route.
- Journey spans and perf counters already exist for the main user paths in `src/routes/conflicts/+page.svelte`, `src/routes/conflict/+page.svelte`, `src/routes/bubble/+page.svelte`, `src/routes/tiering/+page.svelte`, `src/routes/aava/+page.svelte`, `src/lib/binary.ts`, and `src/lib/prefetchCoordinator.ts`; conflict-grid bootstrap now also records dataset-create vs active-layout bootstrap timing separately, AAVA now records client-entry-load, context-load, row-build, grid-provider, and first-mount spans, and `scripts/verifyNavigation.mjs --report-perf` now snapshots those spans at completed route first-mount.

## Measured Cold-Load Snapshots

Captured from the current production build on `2026-04-14`, plus targeted validating reruns on `2026-04-17` for the actively edited routes:

- `/conflict`: app spans still show ready in under a second; the latest local verification run now reports ready `~931ms`, `dataFetch ~235ms`, and `firstMount/routeTransition ~260ms`. The targeted Lighthouse rerun after keeping the KPI section mounted from first paint and reserving stable KPI card heights materially closed the old layout-shift gap: `layout=coalition` now lands around score `75`, FCP `3.4s`, LCP `4.9s`, TBT `0ms`, CLS `0.018`, and page-owned long task `113ms`, while `layout=nation` lands around score `75`, FCP `3.4s`, LCP `4.9s`, TBT `0ms`, CLS `0.017`, and page-owned long task `109ms`. The direct `/conflict` bottleneck is still shared/client route-entry JS and shell weight, but the earlier late-KPI/layout movement regression is no longer the dominant issue.
- `/bubble`: after keeping direct graph payload loads on the `worker-bytes` strategy, moving visible route entry off the prefetch queue, letting `src/app.html` start a real compressed-byte prime, fixing the graph worker bundling boundary so direct graph workers ship as real worker entries, and then bootstrapping first paint through the bubble worker instead of materializing full `GraphData` on the main thread, repeated validating runs now land around `~0.93-1.04s`; `decompress.prime.hit=1`, `decompress.worker.bytes.fetch ~0.10-0.16s`, `decompress.worker.bytes.inflate ~0.028-0.029s`, `decompress.worker.bytes.unpack ~0.093-0.124s`, `journey.conflict_to_bubble.graphCompute ~0.006-0.013s`, and `graph.bubble.render.canvas ~0.010-0.016s`. The route no longer needs a visible-path full-graph object on the main thread when the worker path is available; the remaining cold-route gap is now the shell-prime wait plus worker inflate/unpack rather than main-thread unpack or worker-to-main full-payload transfer.
- `/tiering`: after the same shell-prime path, the direct compressed-byte bootstrap in `src/lib/conflictArtifactRegistry.ts`, the graph worker bundling fix, and the existing route-owned canvas renderer in `src/lib/tieringCanvas.ts`, repeated validating runs now land around `~0.95-0.99s`; `decompress.prime.hit=1`, `decompress.worker.bytes.fetch ~0.118-0.120s`, `decompress.worker.bytes.inflate ~0.028-0.035s`, `decompress.worker.bytes.unpack ~0.100-0.129s`, `journey.conflict_to_tiering.graphCompute ~0.010s`, `graph.tiering.setupCharts.canvas ~0.013-0.015s`, and slider setup `~0.003s`. The remaining gap is still the shell-prime wait plus worker inflate/unpack slice rather than route-local render or a main-thread full-graph decode.
- `/aava`: after moving the direct route entry onto a thin shell in `src/routes/aava/+page.svelte` and shifting the interactive controller into `src/routes/aava/AavaRouteClient.svelte` while keeping the `aavaGrid` and KPI-builder splits, the latest targeted Lighthouse rerun still leaves this route as the worst cold direct entry, but it does improve the browser-owned long task: score `34`, FCP `3.5s`, LCP `5.1s`, TBT `3194ms`, CLS `0.214`, page-owned long task `3148ms`, and unused JS `69 KiB`. Direct `build/aava.html` now modulepreloads only the thin route node and dynamic-imports the route-local client controller. The updated `scripts/verifyNavigation.mjs --report-perf` spans show direct `/aava?id=161` ready around `1048.8ms`, with `journey.conflict_to_aava.clientEntryLoad ~19.9ms`, `journey.conflict_to_aava.contextLoad ~356.6ms`, `journey.conflict_to_aava.rowBuild ~89.3ms`, `journey.conflict_to_aava.gridProvider ~0.3ms`, and `journey.conflict_to_aava.firstMount ~403.9ms`. That narrows the thin route-entry split itself to only a few tens of milliseconds and leaves the remaining Lighthouse long task outside the route entry and outside context load, row build, grid-provider creation, or the deferred builder/modal path. A larger reserved placeholder shell regressed both TBT and CLS and was reverted.

The new `decompress.worker.bytes.fetch` span measures the remaining wait on the shell-started compressed-byte promise once route JS attaches, not just raw post-hydration network time. The `decompress.worker.bytes.inflate` and `decompress.worker.bytes.unpack` spans now reflect worker-side work during direct graph bootstrap rather than main-thread decode.

Before those optimizations, the direct graph routes were measuring at roughly `32-33s` with `journey.*.workerCompute ~29-30s` and no successful worker timing counters, which was consistent with the cold shared-worker dataset path timing out and then falling back.

## Global Cold-Load Model

Before any route-specific data work happens, every page now pays for the shared shell owned by `src/routes/+layout.svelte`:

- app-owned shell CSS from `src/styles/app-shell.css`
- route-specific CSS only when that route imports it, such as the home-page `Chakra Petch` font in `src/routes/+page.svelte`

Current shell classification:

- removed from the universal path: legacy polyfill script, Bootstrap bundle, Bootstrap Icons CSS
- removed from the universal path: Halfmoon CSS/theme, the static `main.css` link, and the universal `Chakra Petch` font import
- moved off the universal path: analytics, vis-timeline CSS
- still required on every route today: the app-owned root-layout shell CSS

Analytics is now deferred until post-load idle work, vis-timeline CSS moved out of the universal shell onto the routes that actually render timelines, and the framework/theme CSS dependency is gone from `src/app.html`. Dropdown behavior and iconography are now shipped as app-owned route code instead of universal third-party shell assets, and non-home routes no longer pay the `Chakra Petch` fetch before route work begins.

The production build also shows that route code is split, but the graph routes still share a large client chunk:

- largest shared client chunk in that build: `225.58 kB` (`78.14 kB` gzip)
- the direct graph routes still pay a meaningful route-entry/runtime chunk on top of that shared payload, even though `/tiering` no longer imports Chart.js

That matches the route imports in the graph pages:

- `src/routes/bubble/+page.svelte` now uses the shared in-repo `src/components/GraphSlider.svelte` timeline control, while `src/lib/bubbleCanvas.ts` owns the route-local bubble canvas renderer and uses `d3` only for palette generation.
- `src/routes/tiering/+page.svelte` now routes its slider state through `src/components/TieringControlsPanel.svelte` and the shared `src/components/GraphSlider.svelte`, while `src/lib/tieringCanvas.ts` owns the route-local stacked-bar canvas renderer instead of Chart.js
- `src/routes/chord/+page.svelte` imports `d3`

The current matrix makes the remaining ownership problem clearer:

- representative routes still show about `404-434 KiB` of unused first-party JS on cold entry
- `build/conflict.html` still modulepreloads a wide first-party graph before the table is usable
- the targeted `/conflict` Lighthouse rerun now puts direct-route CLS at only about `0.017-0.018`, so the earlier large layout movement was specifically owned by late KPI shell/card growth rather than worker-backed table bootstrap
- `/tiering` and `/bubble` now show route-ready under `1s` in the app spans but still record `24.1s` Lighthouse LCP, so route-local “ready” and browser-visible LCP are clearly no longer the same bottleneck
- `/aava` is still the clearest main-thread outlier, now at about `3194ms` TBT and a page-owned long task around `3148ms`, while the route spans show only about `20ms` of client-entry load and about `404ms` of route-owned first-mount work once the route-local client controller is running

The remaining cold-load problem is therefore not primarily raw HTML, static CSS weight, graph worker bootstrap, or the thin AAvA route entry itself. It is page-owned client compute/hydration arriving too early, plus remaining layout movement on `/aava`.

Cold-load latency is therefore a combination of:

- global third-party shell cost
- route bundle download and parse cost
- payload fetch and gzip/msgpack decode cost
- worker startup and structured clone cost
- route-local derived compute

## End-To-End Pipeline By Route

### `/conflicts`

Pipeline:

1. `src/routes/conflicts/+page.ts` queues `warmConflictsIndexPayload(...)`.
2. `src/routes/conflicts/+page.svelte` mounts, restores query state, and calls `decompressBson(getConflictsIndexUrl(...))`.
3. `src/lib/binary.ts` fetches and decompresses the conflicts index payload, usually through the shared decompress worker in `src/workers/decompressWorker.ts`.
4. The page reshapes raw rows into `ConflictsIndexRow[]`, then creates an in-memory grid provider through `src/lib/conflictsIndexGrid.ts`.
5. `src/lib/grid/DataGrid.svelte` bootstraps from that provider, queries the first page, then queries summary data.
6. The vis timeline runtime is intentionally deferred and loaded later through `ensureTimelineScriptLoaded()`.

What is precomputed today:

- the payload can be prefetched
- the page reshapes all conflict rows eagerly once loaded
- provider cell/sort/filter caches are lazy and per-row

Why this route feels relatively good today:

- there is no route-specific worker bootstrap on the critical path
- the timeline runtime is not required before the first table render
- the shared data cache makes revisits cheap

### `/conflict`

Pipeline:

1. `src/routes/conflict/+page.ts` warms the worker-backed conflict-table artifact for the requested layout.
2. `src/routes/conflict/+page.svelte` mounts, resolves the `id`, and calls `beginConflictLoad(...)`.
3. `beginConflictLoad(...)` creates a `ConflictGridWorkerClient` through `src/lib/conflictGrid/workerClient.ts`.
4. `client.bootstrap(layout)` sends an RPC to `src/workers/conflictGridWorker.ts`.
5. The worker fetches and decompresses the conflict payload itself, creates the dataset through `src/lib/conflictGrid/dataset.ts`, and returns bootstrap metadata.
6. The page builds the provider through `src/lib/conflictGrid/conflictGridProvider.ts`.
7. `src/lib/grid/DataGrid.svelte` boots, queries the first page, queries summary, and lazily resolves expanded detail rows.
8. After the first usable table result, the page schedules non-current layout prewarm and queues graph-related artifact warmers.

What is precomputed today:

- non-aggressive conflict-grid warms now seed the requested shared bootstrap/layout artifact directly, while explicit aggressive prewarm still owns the heavier metric-vector warm path
- `src/lib/conflictGrid/dataset.ts` now builds only the accessed layout during bootstrap and defers non-active layouts until explicit access or `prewarm(...)`
- the same dataset creation still builds preset KPI summary data, but it no longer has to construct nation rows just to compute preset KPI aggregates
- `prewarm(...)` can eagerly materialize metric vectors for selected layouts and optionally warm the base filter/sort path
- page results and summaries are still query-time, but are cached by visible row-id sequence and visible columns

Why this route still has meaningful first-entry latency:

- direct cold load still waits on a worker-local fetch/decompress and active-layout dataset build before the first table query starts
- SPA preload and likely return-navigation paths now warm the same shared worker dataset the route consumes, but direct cold load still has no equivalent warmed bootstrap path
- non-active layouts remain intentionally off the cold path until explicit prewarm or layout switch

### `/bubble`

Pipeline:

1. `src/routes/bubble/+page.svelte` exposes `data_origin` and `graph_data` version metadata in the route head, `src/app.html` uses that metadata to add a preload hint and start a one-shot compressed-byte prime for the direct `/bubble` `graph_data` URL before route JS boots, and `src/routes/bubble/+page.ts` primes the same compressed payload on SPA navigation.
2. `src/routes/bubble/+page.svelte` acquires a registry-owned bubble artifact handle through `src/lib/conflictArtifactRegistry.ts`.
3. On the visible worker path, that handle consumes the primed compressed bytes, transfers them once into `src/workers/bubbleTraceWorker.ts`, inflates and unpacks there, stores the full dataset in the worker, computes the requested first trace there, and returns only compact route info plus the computed trace to the page.
4. The page keeps only compact route info on the main thread unless the worker path is unavailable, while later trace requests still resolve through the shared handle and `src/lib/graphDerivedCache.ts`.
5. `src/lib/bubbleCanvas.ts` builds a lightweight render model from that derived trace result, and `src/routes/bubble/+page.svelte` renders the active frame, playback state, and hover tooltip through its route-owned canvas instead of a third-party runtime scene graph.

What is precomputed today:

- the raw graph payload can be prefetched and is shared by URL
- the prefetch path can compute a default bubble trace into `src/lib/graphDerivedCache.ts`
- the route itself also caches derived traces in that same shared cache, and bubble route warm composition now covers only payload plus default trace

Important caveat:

- the route, the warmer, and the shared cache still resolve through the same versioned default-trace key, and visible navigation now attaches to pending warmed derived state before falling back to a fresh worker bootstrap
- the remaining in-repo bubble gap is the shell-prime wait plus worker inflate/unpack, plus a small route-owned canvas render in `src/lib/bubbleCanvas.ts`

Result:

- cross-route bubble warming still removes duplicated dataset init and default-trace compute when the warmed artifact is already fresh
- direct cold load now lands near `~0.93-1.04s` on the measured build; the validating runs record `decompress.prime.hit=1`, no visible-path full-graph main-thread materialization, and `graph.bubble.render.canvas ~0.010-0.016s`, so the old Plotly first-paint bucket is gone and the remaining visible work is the shell-prime wait plus worker inflate/unpack slice rather than route-local render cost

### `/tiering`

Pipeline:

1. `src/routes/tiering/+page.svelte` exposes `data_origin` and `graph_data` version metadata in the route head, and `src/app.html` uses that metadata to add a preload hint and start a one-shot compressed-byte prime for the direct `/tiering` `graph_data` URL before route JS boots; `src/routes/tiering/+page.ts` primes the same compressed payload on SPA navigation.
2. `src/routes/tiering/+page.svelte` acquires a registry-owned tiering artifact handle through `src/lib/conflictArtifactRegistry.ts`.
3. On the visible worker path, that handle consumes the primed compressed bytes, transfers them once into `src/workers/tieringDataWorker.ts`, inflates and unpacks there, stores the full dataset in the worker, computes the requested first dataset there, and returns only compact route info plus the selected-alliance snapshot and computed dataset to the page.
4. The page keeps only compact route info on the main thread unless the worker path is unavailable, while later tiering dataset requests still resolve through the shared handle and `src/lib/graphDerivedCache.ts`.
5. `src/routes/tiering/+page.svelte` now renders the selected dataset through the route-owned canvas renderer in `src/lib/tieringCanvas.ts`, which keeps the tiering first paint off the old Chart.js controller/update path while preserving the same slider/filter data flow.
6. After load, the page warms the worker-backed conflict-table artifact used by `/conflict` return navigation.

What is precomputed today:

- the raw graph payload can be prefetched and is shared by URL
- the prefetch path can compute a default tiering dataset into `src/lib/graphDerivedCache.ts`

Important caveat:

- the route and the warmer still share the same derived-cache key space, and visible navigation now attaches to pending warmed default datasets before falling back to a fresh worker bootstrap when the request stays on the default all-alliances selection
- only the default request shape is proactively prefetched; non-default configurations still compute on first access even though they are now shared afterwards

Result:

- off-screen `warmTieringDefaultArtifact(...)` still reduces first render latency when the default dataset is already warm
- direct cold load now lands around `~0.95-0.99s` on the measured build instead of waiting behind the prior `~33s` cold shared-worker path; the next remaining cost is the shell-prime wait plus worker inflate/unpack slice rather than route-local render, slider setup, or graph compute

### `/aava`

Pipeline:

1. `src/routes/aava/+page.svelte` renders the thin direct shell, preconnects the data origin, and starts a dynamic import of `src/routes/aava/AavaRouteClient.svelte`.
2. `src/routes/aava/AavaRouteClient.svelte` resolves either a single conflict or a composite context through `bootstrapConflictRouteLifecycle(...)`.
3. It loads conflict data through `loadConflictContext(...)` in `src/lib/conflictContext.ts`; in composite mode that fetch+merge can now resolve through `src/lib/compositeContextWorker.ts` / `src/workers/compositeContextWorker.ts` when the worker is available.
4. It derives a serializable AAvA selection source and attaches `src/lib/aavaSelectionEngine.ts` / `src/workers/aavaSelectionWorker.ts` to that source.
5. The route-local client requests selection rows from that engine by snapshot key, caches resolved row sets locally, and then lazy-loads `src/lib/aavaGrid.ts` together with `src/lib/grid/DataGrid.svelte` to create the in-memory grid provider only once rows exist.
6. The shared `DataGrid` handles the first page query and later interactions once rows are ready, while the KPI builder path keeps `src/components/KpiBuilderModal.svelte` and `$lib/kpi` behind a separate interaction-owned lazy boundary.

What is precomputed today:

- composite context fetch+merge can now resolve through the shared worker path and then reuse `src/lib/compositeContextCache.ts`
- selected AAvA row sets are cached by selection key inside the route and are computed through a worker-backed engine when workers are available
- the visible table path now lazy-loads `src/lib/aavaGrid.ts` with `DataGrid`, and the KPI builder keeps `$lib/kpi` plus modal assets off the direct route entry until the user opens it
- provider cell/filter/sort caches are lazy

Latency note:

- composite fetch+merge no longer has to pin the main thread when `loadConflictContext(...)` owns payload loading and the shared worker path is available
- first AAvA row build now prefers the dedicated selection worker path and falls back to local compute only on worker failure
- direct `/aava?id=161` now measures at about `ready ~1048.8ms`, `clientEntryLoad ~19.9ms`, `contextLoad ~356.6ms`, `rowBuild ~89.3ms`, `gridProvider ~0.3ms`, and `firstMount ~403.9ms` in `scripts/verifyNavigation.mjs --report-perf`; `firstMount` still includes the visible `DataGrid` code path, the thin route-entry split itself is only a few tens of milliseconds, and the latest targeted Lighthouse rerun improves the page-owned long task to about `3148ms` without changing the fact that the remaining long task sits outside those route-owned spans in shared/client hydration or later client-controller parse/eval/visible copy

### `/conflicts/view`

Pipeline:

1. `src/routes/conflicts/view/+page.ts` parses `ids` and optionally warms composite context only when `aid` is already known.
2. `src/routes/conflicts/view/+page.svelte` creates `src/lib/compositeConflictGrid/session.ts`, which resolves alliance options and active composite datasets through `src/workers/compositeConflictGridWorker.ts` when workers are available.
3. The session loads the selected conflict payloads, derives the common-alliance candidate set, and reuses those loaded payloads across later selected-alliance changes.
4. After the route resolves the active alliance, the session client bootstraps the merged conflict-grid dataset and active layout through the same worker-backed path, then schedules deferred secondary-layout prewarm.
5. The shared `DataGrid` queries the composite session client rather than a page-local dataset.

What is precomputed today:

- composite context entries are cached in `src/lib/compositeContextCache.ts` with a TTL
- the composite grid session reuses loaded payloads and per-alliance merged datasets within its worker/local lifetime, and the merged datasets get the same row/metric/page-result caches as the single-conflict dataset

Latency note:

- per-conflict payload load, alliance-candidate derivation, composite merge, and active-layout dataset bootstrap can now stay off the main thread on worker-capable clients, with local fallback only on worker failure
- the route still derives its merged view from raw payloads on cold direct navigation, even though the heavy merge/bootstrap work can stay on the worker path

### `/chord`

Pipeline:

1. `src/routes/chord/+page.svelte` loads the conflict payload through `decompressBson(getConflictDataUrl(...))`.
2. It yields once, then builds the web layout on the main thread using D3.
3. After load, it warms graph payload and graph default artifacts for bubble/tiering.

Latency note:

- this route benefits from the shared raw conflict payload cache
- it now also warms the shared conflict-table worker artifact for likely return navigation to `/conflict`

## What Is Actually Precomputed Today

| Surface | Eager or prefetched today | Still query-time or route-time today | Notes |
| --- | --- | --- | --- |
| `/conflicts` | conflicts index payload; full `ConflictsIndexRow[]` reshape after load | provider cell/filter/sort caches, page slice, summary | all main-thread, but straightforward |
| `/conflict` | active-layout bootstrap columns/rows on demand, preset KPI metrics, optional metric vectors and warm filter path in worker | secondary layouts, filter/sort/page, summary, detail rows, selection snapshots, KPI queries | active layout is now on-demand; non-active layouts are deferred |
| `/bubble` | route-head metadata plus a shell-started preload hint and compressed-byte prime for direct `graph_data`; `src/routes/bubble/+page.ts` primes the same compressed payload on SPA navigation; the bubble worker consumes those bytes once, keeps the full dataset in-worker, and returns compact route info plus the initial trace; default trace can still be prefetched and consumed via shared cache | first non-default trace render, route-owned canvas render | off-screen warmers still use the shared worker parsed-object path, but direct cold load is now mostly remaining wait on the shell-started prime promise plus worker inflate/unpack rather than a late runtime fetch, third-party first render, or main-thread full-payload decode |
| `/tiering` | route-head metadata plus a shell-started preload hint and compressed-byte prime for direct `graph_data`; `src/routes/tiering/+page.ts` primes the same compressed payload on SPA navigation; the tiering worker consumes those bytes once, keeps the full dataset in-worker, and returns compact route info plus the initial dataset and selected-alliance snapshot; default tiering dataset can still be prefetched and consumed via shared cache | first compute for non-default configs, route-owned canvas render | non-default tiering requests still reuse the shared cache afterwards, but the remaining default-route cost is now the shell-prime wait plus worker inflate/unpack slice, not route-local chart work or a main-thread full-graph decode |
| `/aava` | thin direct shell in `src/routes/aava/+page.svelte`; dynamic `src/routes/aava/AavaRouteClient.svelte`; composite context fetch+merge can use the shared worker path and TTL cache; worker-backed selection engine plus route cache by selection key; header/alliance modal chrome stays deferred; `src/lib/aavaGrid.ts` now loads with `DataGrid` on the visible table path; KPI builder storage/sanitization plus modal assets stay off the direct shell until open | client-controller parse/eval after the thin shell, conflict load, first uncached row build for a new selection, grid query, first KPI-builder open | the kept route-entry split now measures only about `20ms` of `clientEntryLoad` and about `404ms` of route-owned first-mount work, while the remaining Lighthouse long task still appears to sit in shared/client hydration or later client-controller work rather than row build, provider creation, or the deferred KPI builder path |
| `/conflicts/view` | optional composite context cache by signature and alliance; worker-backed composite session reuses payloads, alliance options, and per-aid merged datasets during its lifetime | first direct resolve/bootstrap when nothing is warm; grid query | active layout now bootstraps through the composite session worker with local fallback |
| `/chord` | raw conflict payload; idle graph warmers and conflict-table worker warm after page load | D3 layout/render | now useful as a source route for `/conflict` return nav too |

## Reuse Boundaries And Cache Lifetimes

Current cache and worker lifetimes are split across several layers:

- `src/lib/binary.ts`: bounded LRU-style decompressed cache keyed by URL, `48` entries max, no TTL, and pending entries are retained until they settle so in-flight dedupe is preserved
- `src/lib/graphDerivedCache.ts`: graph-derived TTL cache, `8 minutes`, `60` entries max
- `src/lib/compositeContextCache.ts`: composite context TTL cache, `6 minutes`, `20` entries max
- `src/lib/compositeContextWorker.ts`: shared composite-context worker singleton; merge freshness still resolves through `src/lib/compositeContextCache.ts`
- `src/lib/conflictGrid/workerClient.ts`: shared conflict-grid worker handle, `60 seconds` idle TTL
- `src/lib/conflictArtifactRegistry.ts`: shared bubble and tiering worker handles with `60 seconds` idle TTL, plus explicit dependency edges for graph/table artifact descriptors
- `src/lib/prefetchCoordinator.ts`: `completedKeys` are still session-scoped, but graph/composite/conflict-grid tasks now also expose freshness checks so expiry or invalidation can make them eligible to refill

This means repeated navigation is already helped by several hot layers, but the freshness model is still only partially unified:

- some artifacts expire
- some workers expire
- some caches never expire
- graph/composite/conflict-grid artifacts now report freshness back to the coordinator, but legacy non-TTL tasks still rely on session-level completion semantics

## High-Confidence Findings

### 1. The universal shell no longer ships third-party framework CSS or a universal webfont on every route.

Why:

- `src/app.html` no longer loads the legacy polyfill script, Bootstrap JS bundle, Bootstrap Icons CSS, Halfmoon CSS/theme, or the old global stylesheet link
- `src/routes/+layout.svelte` now owns the shared shell through `src/styles/app-shell.css`, which is emitted as a small app-owned layout stylesheet in the build
- `src/routes/+page.svelte` now imports `Chakra Petch` only for the home hero, so non-home routes stay on the system stack

Impact:

- every non-home cold route load avoids the previous framework CSS fetches and the old universal webfont request before route prefetch can help
- the remaining universal shell tax is now the app-owned layout stylesheet plus route-local assets, which keeps future shell work focused on trimming app CSS rather than removing another third-party theme layer

### 2. Route warmers now converge on a general artifact registry, but direct cold load still falls back to the existing raw payload and worker bootstrap paths.

Why:

- `src/lib/conflictArtifactRegistry.ts` now owns graph payload keys, shared bubble/tiering worker handles, default artifact descriptors, and explicit dependency edges for graph/table artifact families
- `src/lib/prefetchArtifacts.ts` now queues registry descriptors instead of owning hidden graph workers directly
- `src/routes/bubble/+page.svelte` and `src/routes/tiering/+page.svelte` now acquire registry-owned handles instead of creating page-local graph workers

Impact:

- likely graph and table navigations now attach to the same warmed artifact owners instead of duplicating worker dataset init
- the remaining gap is direct cold-load cost on the accepted raw payload and worker paths, not consumer alignment

### 3. Tiering warmers now share the route's real worker path, but only the default request shape is proactively warmed.

Why:

- `src/lib/conflictArtifactRegistry.ts` now owns the shared tiering worker handle and dataset compute path
- `src/routes/tiering/+page.svelte` resolves datasets through that shared handle and `src/lib/graphDerivedCache.ts`, so non-default requests can now be reused across revisits too
- `warmTieringDefaultArtifact(...)` still targets only the default metric/alliance/color/band shape

Impact:

- high-priority default tiering precompute can now shorten the first chart render without paying a second worker init path on route entry
- non-default tiering configurations still pay their first compute on demand because only the default request shape is proactively warmed

### 4. Bubble warmers now share the route's real worker path, so the remaining bubble gap is direct cold-load cost rather than worker ownership.

Why:

- `src/lib/conflictArtifactRegistry.ts` now owns the shared bubble worker handle and default-trace descriptor
- `src/routes/bubble/+page.svelte` resolves traces through that shared handle and `src/lib/graphDerivedCache.ts`
- the route and warmer now share both the derived-cache key and the worker dataset-init path

Impact:

- `warmBubbleDefaultArtifact(...)` can now remove duplicated worker dataset init as well as first visible default-trace compute when the warmed artifact is still fresh
- the remaining user-visible cost is raw graph payload fetch plus interactive setup when nothing is warm, not split graph worker ownership

### 5. Worker-dataset warming now reaches the `/conflict` table route from the real source routes, but raw payload warmers alone are still insufficient.

Why:

- `src/workers/conflictGridWorker.ts` fetches and decompresses conflict data internally
- `src/lib/binary.ts` caches main-thread payload promises, but the worker path bypasses that cache
- `src/lib/prefetchArtifacts.ts` now exposes `warmConflictTableArtifact(...)`, and the graph/AAvA/chord routes plus `/conflict` SPA preload now use it

Impact:

- likely return navigation and direct SPA preload into `/conflict` can now attach to a warmed worker dataset instead of starting from scratch
- any future route that warms only the main-thread payload will still miss the worker-backed consumer path

### 6. Prefetch completion now follows freshness for the current expiring artifact families, but legacy tasks still use session completion.

Why:

- graph-derived, composite-context, and conflict-grid warmers now expose `isFresh` checks to `src/lib/prefetchCoordinator.ts`
- the coordinator now skips already-fresh artifacts even when they were warmed by another code path, and it allows refills after freshness drops

Impact:

- current TTL-backed artifact warmers can refill after expiry or invalidation instead of staying permanently suppressed
- tasks without freshness hooks still behave like session-complete work until they are migrated onto the same contract

### 7. Graph warmers and graph routes now share registry-owned workers; the remaining graph cost is still full interactive artifact setup.

Why:

- `src/lib/conflictArtifactRegistry.ts` now owns shared bubble and tiering worker handles keyed by conflict/version
- route entry and prefetch both resolve through those handles instead of through separate worker owners
- the warmed artifacts are still full interactive worker datasets plus derived cache entries, not compact first-paint payloads

Impact:

- later graph work should focus on shrinking the artifact needed for first paint, not on unifying worker ownership again

### 8. Composite-heavy secondary routes now have explicit worker-backed compute boundaries, but they still derive first paint from raw payloads rather than remote artifacts.

Why:

- `src/lib/conflictContext.ts` now resolves composite fetch+merge through `src/lib/compositeContextWorker.ts` / `src/workers/compositeContextWorker.ts` when it owns payload loading itself
- `src/routes/conflicts/view/+page.svelte` now resolves alliance options, composite merge, and active-layout bootstrap through `src/lib/compositeConflictGrid/session.ts` / `src/workers/compositeConflictGridWorker.ts`, with local fallback only on worker failure
- `src/routes/aava/+page.svelte` now computes selection rows through `src/lib/aavaSelectionEngine.ts` / `src/workers/aavaSelectionWorker.ts`, with local fallback only on worker failure

Impact:

- large composite and AAvA routes no longer need to pin the main thread for their heaviest repeated merge/selection math on worker-capable clients
- the remaining latency gap is now direct cold-load cost and shell cost, not page-local composite merge or AAvA row derivation

### 9. The shared grid itself is no longer the main cold-load problem.

Why:

- `src/lib/grid/DataGrid.svelte`, `src/lib/grid/renderState.ts`, and the in-memory/conflict-grid providers already do a lot of identity reuse and mounted-shell preservation

Impact:

- the next meaningful latency wins are in warm ownership, worker handoff, and unnecessary global or prefetched work

### 10. Conflict-grid bootstrap timing is now visible as separate dataset-create and active-layout bootstrap spans.

Why:

- `src/workers/conflictGridWorker.ts` now reports whether bootstrap had to create the dataset plus how long active-layout bootstrap took
- `src/routes/conflict/+page.svelte` records those worker timings as separate perf spans
- `src/routes/conflicts/view/+page.svelte` now records the composite worker's dataset-create and active-layout bootstrap timings separately before deferring secondary layouts

Impact:

- future direct-cold-load and worker-bootstrap work can target measured buckets instead of one opaque conflict-grid bootstrap blob

### 11. `/conflicts/view` now uses a worker-owned composite grid path instead of a page-local merge/bootstrap pipeline.

Why:

- `src/lib/compositeConflictGrid/session.ts` now owns the composite route's resolve/bootstrap boundary with worker-first, local-fallback behavior
- `src/workers/compositeConflictGridWorker.ts` keeps loaded payloads and per-alliance merged datasets on the worker side during the worker lifetime
- `src/routes/conflicts/view/+page.svelte` now talks to the shared `createConflictGridProvider(...)` shape instead of creating a route-local dataset directly

Impact:

- composite layout switches still avoid eager secondary-layout work, but the route no longer has to own raw payload arrays or merge/bootstrap dataset state
- the remaining composite-view gap is direct cold-load cost on the existing raw/composite worker path, not a missing worker-backed merge/bootstrap layer

### 12. The raw payload cache is now bounded instead of growing without limit across long sessions.

Why:

- `src/lib/binary.ts` now tracks decompressed payloads as LRU-style cache entries with a `48` entry cap
- eviction skips in-flight requests so identical concurrent payload loads still dedupe cleanly

Impact:

- repeated navigation keeps the hot-path benefit of cached raw payloads without turning the cache into an unbounded session-long memory sink
- later cache-freshness work can build on a bounded payload layer instead of assuming raw payloads are immortal

### 13. Prefetch dependency accounting is now explicit for the current graph and table artifact families.

Why:

- `src/lib/conflictArtifactRegistry.ts` now declares `bubble-default -> graph-payload`, `tiering-default -> graph-payload`, and `conflict-grid -> conflict-payload`
- `src/lib/prefetchArtifacts.ts` now queues those registry descriptors with the dependency metadata and dependency-aware byte estimates

Impact:

- future artifact-level admission control has stable dependency keys to build on instead of reconstructing hidden relationships from reasons or warm-function internals

### 14. Graph-route warm composition is now explicit, and shared graph payload promotion no longer depends on whichever destination queued it first.

Why:

- `src/lib/prefetchArtifacts.ts` now exposes `warmBubbleRouteArtifacts(...)` and `warmTieringRouteArtifacts(...)`, and the conflict/chord/AAvA/conflicts-list/tab callers now use those helpers instead of hand-assembling different subsets of payload/default work.
- `src/lib/prefetchCoordinator.ts` now lets a queued task carry multiple promotion targets, so the shared graph payload can still be promoted by `/bubble` or `/tiering` even when it was first queued by the other destination.
- `src/lib/graphDerivedCache.ts` now records warm-path hit vs pending vs miss, and `scripts/verifyNavigation.mjs` now asserts the warmed `/bubble`, `/tiering`, and graph-to-`/conflict` return paths against those live counters.

Impact:

- graph-route warming no longer drifts between `payload + default`, `payload + default + runtime`, and mis-targeted promotion semantics depending on which route initiated the warm.
- warmed graph navigation is now validated against the real route attach path instead of being inferred only from static reasoning or registry unit coverage.

### 15. The client build still ships legacy-transformed first-party code on the modern-browser cold path.

Why:

- `vite.config.ts` still runs `@rollup/plugin-babel` with `@babel/preset-env` over `src/**/*` and `workers/**/*`
- Vite, esbuild, and optimizeDeps are all still targeted to `es2016`
- the Vite legacy plugin is already disabled, so the downlevel work is no longer isolated behind a separate compatibility lane

Impact:

- Lighthouse flags legacy JavaScript, and the biggest first-party chunk is spending most of its wall time in evaluation rather than parse
- the next in-repo build step should be a baseline-modern target with Babel either removed from the hot client path or narrowed to a proven compatibility surface

### 16. `/conflict` still pays `vis-timeline` CSS and JS before the timeline is needed.

Why:

- `src/routes/conflict/+page.svelte` injects the timeline stylesheet and script unconditionally in `<svelte:head>`
- `initializeTimeline()` still waits for table-ready state and later route logic before the timeline is actually constructed
- there is no visibility gate or interaction-owned asset loader between route entry and those third-party assets

Impact:

- direct `/conflict` loads pay render-blocking CSS plus third-party JS parse/eval even when the user only needs the table first
- the ideal state is route-owned timeline loading after first paint or on explicit reveal, not unconditional head injection

### 17. `/conflict` still eagerly imports closed modal, KPI, and preset-management surfaces on direct load.

Why:

- `src/routes/conflict/+page.svelte` imports `ColumnPresetManager`, `ConflictKpiSection`, `KpiBuilderModal`, `SelectionModal`, and other secondary surfaces up front
- those components contribute CSS and JS to the same direct-entry path even when their UI starts closed
- the route does not currently distinguish a minimal first-paint table shell from deferred secondary chrome

Impact:

- the route pays for modal and KPI code before the table becomes useful
- the next route-level latency work should split first-paint table shell from post-first-paint or on-demand secondary UI

### 18. Current perf acceptance still over-relies on route spans and lacks explicit build or audit budgets.

Why:

- route spans are useful for worker/bootstrap ownership, but they do not capture early shared-JS evaluation, render-blocking CSS fan-out, or third-party head work
- there is no explicit chunk-size or Lighthouse regression budget in the repo today
- `chart.js` remains in `package.json` even though the current `src/**` tree no longer imports it

Impact:

- the roadmap needs build-output and audit acceptance, not only route-local timing spans
- dead dependencies and chunk growth can otherwise return without violating any current perf assertion

## Second-Pass Issues With The Current Plan

The first pass identified the right families of problems, but it left several architectural distinctions too fuzzy.

### The first pass treated all existing precompute as a win.

That is not always true:

- default graph warmers now reach their real route consumers through the registry, but they still warm full interactive worker state
- composite/local dataset consumers now defer secondary layouts correctly, but merge and payload load are still fully main-thread bound
- any precompute that only reproduces full interactive state still needs to justify its memory and CPU cost against the user-visible latency it saves

The plan therefore needs to separate:

- beneficial user-path precompute
- useful background interactive prewarm
- dead or harmful warm work

### The first pass was too loose about the accepted data boundary.

The app already reads remote data through the existing `conflict_data` and `graph_data` payload families under `appConfig.data_origin`.

Latency work in this repo should improve reuse, sequencing, and ownership around those existing payloads rather than introducing new remote payload families or shape/version acceptance paths without a separate explicit decision.

### The first pass understated a bubble-specific worker ownership bug.

The bubble route and the prefetch bubble warmer do not just duplicate work; they also share readiness state in a way that can skip page-worker init and force fallback behavior. That makes bubble correctness and bubble latency cleanup a P0 item rather than just a general P1 registry refactor.

### The first pass did not call out dependency accounting inside the prefetch coordinator.

Derived warmers currently hide their graph-payload dependency from budget accounting. The long-term registry design should model dependencies explicitly so a default trace warm is either:

- attached to an already-ready graph payload, or
- counted as a graph payload plus derive step

### The first pass over-relied on route perf spans as the cold-load truth.

That is now demonstrably false on `/conflict`:

- route spans say the page is effectively ready in under a second
- Lighthouse still shows `~2.8s` FCP and `~3.1s` LCP on the same route even though TBT is now `0ms`
- the missing time is dominated by shared JS evaluation and the remaining render-blocking route shell that sit outside the route-owned spans

The plan therefore needs build, chunk, and audit acceptance in addition to route-local spans.

## Concrete Optimal End State

The concrete optimal end state keeps the current remote data boundary unchanged and reduces latency through better reuse of the existing raw payload, worker, warm, and shell paths.

### Shared registry contract

All route warmers and route components should resolve through one registry keyed by:

- current artifact family
- conflict or composite signature
- data version

Each registry entry should expose:

- dependency list
- freshness state
- owning worker handle if worker-backed
- attach promise for consumers
- invalidate rules

### Concrete route behavior in the ideal state

1. Hover/focus/pointerdown warms exactly the same worker/runtime/default-derive promises that the clicked route will later await.
2. Direct navigation continues to use the existing raw `conflict_data` and `graph_data` payload families rather than adding new route-shaped remote payloads.
3. Raw payload fetch, worker bootstrap, and route-local runtime load start as early as practical, with active-layout/default-shape work ahead of secondary or non-default work.
4. Non-active layouts, non-default traces, and heavy secondary KPI work stay behind first paint.
5. Expired warm results can be refilled because freshness is tracked below and above the queue layer.
6. Modern browsers receive modern client and worker output; the hot path is not globally downleveled through Babel unless a proven compatibility hole remains.
7. Direct `/conflict` first paint includes only the conflict title, essential table controls, and initial table shell/bootstrap. Timeline, KPI builders, selection modals, preset managers, and other closed secondary chrome load after first paint or on explicit user action.
8. Route heads declare only assets that must exist before first useful paint. Deferred timeline assets and analytics are loaded from route-owned gates rather than unconditional head tags.
9. Critical CSS is collapsed to the smallest route shell needed for first paint; secondary modal and KPI styles do not fan out into many blocking CSS files.

### Concrete ownership rules in the ideal state

- One readiness map per worker owner, not one readiness map shared across unrelated workers.
- One route should never clear another route or warmer's readiness state as part of unmount.
- Derived warmers should not hide network dependencies from admission control.
- Do not add new remote payload families or route-shaped version/shape acceptance in this repo without a separate explicit decision.
- Shell-owned `src/app.html` should not unconditionally preconnect to or initialize third-party origins that the landing route does not need for first paint.
- Closed modal, builder, or secondary inspector components should not force their JS or CSS into a route's direct cold entry.
- Modern-browser baseline support should be expressed once in build targets, not by globally downleveling every `src/` and `workers/` module on the hot path.

Residual Gaps

- Direct `/conflict` visible latency is still dominated by browser-side shared JS evaluation and the remaining route-shell CSS, not by the worker-backed table bootstrap measured inside route spans.
- `vite.config.ts` no longer uses the old Babel worker downlevel lane, but the repo still lacks an explicit build or Lighthouse budget to keep first-party legacy-JS findings from creeping back.
- `/conflict` no longer injects `vis-timeline` or eager modal/KPI CSS on first paint, but it still blocks on `queryState`, `MenuDropdown`, and the route-shell CSS around the page header and tabstrip.
- `src/routes/conflict/+page.svelte` now loads the visible layout chrome independently from KPI chrome, but the remaining route-shell styles are still heavier than the target budget and Lighthouse needs to be rerun against the current split.
- The new menu/icon primitives still do not have focused component tests.

Acceptance verification completed on `2026-04-14`:

- `npm run check`
- `npm run build`
- `npm run verify:navigation` for direct cold load, hover preload, warmed `/bubble` and `/tiering` route entry, warmed graph-to-`/conflict` return, tab-to-tab navigation, and return navigation across `/conflicts`, `/conflict`, `/bubble`, `/tiering`, `/aava`, `/chord`, and `/conflicts/view`


## Prioritized Checklist

### P0: Remove incorrect or wasted warm work before building new infrastructure

- [x] Fix bubble worker ownership so `src/lib/prefetchArtifacts.ts` warm-worker dataset readiness and `src/routes/bubble/+page.svelte` page-worker dataset readiness are not stored in the same global readiness handle.
- [x] Stop `src/routes/bubble/+page.svelte` from clearing every bubble readiness handle on unmount; limit cleanup to the page-owned worker and its dataset key.
- [x] Make `/tiering` consume the shared warmed default dataset, or temporarily remove `warmTieringDefaultArtifact(...)` until a real consumer exists.
- [x] Replace unconditional same-conflict bubble derived invalidation on `/bubble` load with version-aware invalidation only when the conflict id or `graph_data` version actually changes.
- [x] Make `src/lib/prefetchCoordinator.ts` stop treating a task as permanently complete when its underlying artifact can expire or be invalidated.
- [x] Fix `estimatedBytes` and dependency accounting for `warmBubbleDefaultArtifact(...)` and `warmTieringDefaultArtifact(...)` so coordinator admission reflects the graph payload dependency when it is not already warm.
- [x] Add focused regression tests covering: warmed bubble traces surviving navigation, tiering default warming being either consumed or intentionally disabled, and prefetch completion refilling after cache expiry or invalidation.

### P1: Align current warmers with the current route consumers

- [x] Introduce a shared `ConflictArtifactRegistry` keyed by conflict/composite id plus dataset version, without changing wire format yet.
- [x] Route all existing warmers through that registry instead of letting `prefetchArtifacts.ts` own hidden worker state directly.
- [x] Collapse graph-route prefetch composition into explicit `warmBubbleRouteArtifacts(...)` / `warmTieringRouteArtifacts(...)` helpers so source routes cannot drift on payload/default/runtime composition.
- [x] Make shared graph-payload tasks promotable from both `/bubble` and `/tiering` even after key dedupe inside `src/lib/prefetchCoordinator.ts`.
- [x] Make `src/routes/bubble/+page.svelte` attach to registry-owned bubble dataset/default-trace promises instead of always creating an isolated warm-unaware path.
- [x] Make `src/routes/tiering/+page.svelte` attach to registry-owned tiering dataset/default-dataset promises instead of relying only on its local `dataSetByConfigCache`.
- [x] Make `src/routes/conflict/+page.ts` or an equivalent conflict-route preload hook warm the conflict-grid dataset itself, not only the sibling Plotly runtime.
- [x] Extend `ConflictRouteTabs.svelte` and graph routes so likely return navigation to `/conflict` warms the worker dataset the table route actually consumes.
- [x] Define explicit dependency edges in the registry: `bubble-default -> graph-payload`, `tiering-default -> graph-payload`, `conflict-grid -> conflict-payload`.
- [x] Make non-aggressive conflict-grid warm seed the exact shared bootstrap/layout artifact the route consumes first, while keeping explicit aggressive prewarm for heavier metric-vector work.

### P2: Shorten `/conflict` cold bootstrap instead of only warming around it

- [x] Refactor `createConflictGridDataset(...)` so active-layout row metadata is built first and non-active layouts are deferred until explicit prewarm or layout switch.
- [x] Rework `buildPresetMetrics()` so it can compute preset KPI values directly from raw conflict data instead of requiring full nation-row construction during initial dataset creation.
- [x] Add instrumentation that isolates conflict-grid dataset creation time from later query time so the cost of eager layout construction is visible in perf spans.
- [x] Update `prewarm(...)` to build deferred secondary layouts intentionally after first paint rather than assuming they already exist.
- [x] Apply the same core-vs-secondary split to `createConflictGridDataset(...)` consumers on `/conflicts/view` where practical, because composite route bootstrap is still main-thread bound.

### P3: Eliminate `/conflict` shell and shared-JS overhead

- [x] Remove the Babel worker downlevel lane from `vite.config.ts` and keep the supported browser floor in `@vitejs/plugin-legacy` `modernTargets`; validation that modern-browser Lighthouse no longer reports a meaningful first-party legacy-JS finding remains tracked under P6.
- [x] Prove that the current hot path no longer requires Babel transforms and delete `@rollup/plugin-babel`, `@babel/core`, and `@babel/preset-env` from the repo.
- [x] Split `src/routes/conflict/+page.svelte` into a minimal first-paint table shell versus deferred secondary chrome: the title, essential table controls, and first table bootstrap stay on entry, while `ConflictKpiSection`, `KpiBuilderModal`, `SelectionModal`, `ColumnPresetManager`, and route-owned sibling warm logic move behind post-first-paint or explicit interaction imports.
- [x] Stop injecting `vis-timeline` CSS and JS into the route head on every `/conflict` load; the timeline now loads from a route-owned visibility gate so it does not block the initial table render.
- [ ] Reduce `/conflict` render-blocking CSS fan-out by consolidating always-on route shell styles and deferring styles for closed KPI or modal surfaces; target one route shell stylesheet plus explicitly deferred secondary CSS rather than many small blocking files.
- [x] Route-scope or remove cold-path connection hints in `src/app.html`: only preconnect to `PUBLIC_DATA_ORIGIN` or CDN origins when the landing route will actually use them during first paint, and keep analytics fully post-interactive.
- [x] Remove dead dependency weight from the first-party route graph by deleting `chart.js` from `package.json` once the current `src/**` tree no longer imports it.
- [ ] Add build and audit budgets that make this work durable: fail review when direct `/conflict` regresses past the current Lighthouse baseline, starting with provisional targets of no third-party render-blocking assets, at most two blocking CSS files, no first-party legacy-JS audit items, and no single first-party cold-entry chunk spending more than `~1.0s` in Lighthouse bootup evaluation.

Latest direct `/conflict` build on `2026-04-14` after the root-domain deploy fix, Babel removal, deferred route chrome, and timeline visibility gate:

- client `/conflict` route entry chunk: `30.91 kB` (`11.24 kB` gzip), down from `35.50 kB` (`12.08 kB` gzip)
- server `/conflict` page entry: `8.71 kB` (`3.34 kB` gzip), down from `18.81 kB` (`6.05 kB` gzip)
- direct `/conflict` prerendered shell no longer emits `vis-timeline` CSS/JS or imports the `prefetchArtifacts` graph warm stack on first paint
- a follow-on grid-shell pass removed `ModalShell`, `SelectionModal`, and `ExportDataMenu` from the direct `/conflict` prerendered shell; the remaining blocking CSS there is now `MenuDropdown`, `queryState`, and route shell CSS
- the visible layout controls now load independently from KPI chrome, and the layout-preset overflow modal no longer piggybacks on KPI-section/provider imports
- `node ./scripts/verifyNavigation.mjs --report-perf` now reports direct `/conflict` cold load at `~887.4ms` ready with `~84ms` first-contentful paint in the local verification harness, so the next slice should focus on the remaining grid stylesheet weight and then remeasure Lighthouse rather than reopening graph payload work

### P4: Reduce the universal cold-path shell cost

- [x] Audit every global script and stylesheet in `src/app.html` and classify each as `required-for-every-route`, `route-specific`, or `remove`.
- [x] Move analytics off the universal first-load critical path or gate it behind an explicit post-interactive step.
- [x] Reevaluate the global polyfill script against the supported browser matrix and remove it if it no longer changes real user support.
- [x] Move vis-timeline CSS and any other route-specific styling out of the universal shell if only conflict index/detail pages require it.
- [x] Inventory remaining Bootstrap-JS-dependent behaviors and replace them with smaller Svelte-native primitives where that meaningfully reduces the universal shell.
- [x] Re-run `npm run build` after each shell reduction pass and track whether the shared client chunk and route-entry chunks actually shrink.

Latest shell-reduction build on `2026-04-13` after the shell-cleanup tranche and graph-route warm convergence work:

- largest shared client chunk: `225.58 kB` (`78.14 kB` gzip)
- graph route entry chunk: `64.63 kB` (`23.73 kB` gzip)
- root layout shell CSS asset: `30.10 kB` (`6.15 kB` gzip)

### P5: Reduce main-thread work on secondary heavy routes

- [x] Move composite fetch+merge in `src/lib/conflictContext.ts` to a shared worker path when that layer owns payload loading, so composite `/aava` and composite prefetch do not pin merge CPU to the main thread when worker support exists.
- [x] Move `/conflicts/view` composite payload load/alliance-candidate derivation and active-layout bootstrap onto the shared `src/lib/compositeConflictGrid/session.ts` / `src/workers/compositeConflictGridWorker.ts` path, with local fallback only on worker failure.
- [x] Move AAvA row building onto the worker-backed `src/lib/aavaSelectionEngine.ts` / `src/workers/aavaSelectionWorker.ts` path, with local fallback only on worker failure.
- [x] Add a bounded eviction policy to `src/lib/binary.ts` so repeated navigation stays fast without letting raw payload memory grow without limit across long sessions.
- [x] Add a navigation matrix validation pass covering direct cold load, hover preload, tab-to-tab navigation, and return navigation for `/conflicts`, `/conflict`, `/bubble`, `/tiering`, `/aava`, `/chord`, and `/conflicts/view` via `npm run verify:navigation`.

### P6: Close the loop with explicit acceptance checks

- [x] Verify that warmed `/bubble` navigation skips both raw payload fetch and first default-trace compute on the user-visible path.
- [x] Verify that warmed `/tiering` navigation skips both raw payload fetch and first default-dataset compute on the user-visible path.
- [x] Verify that `/bubble -> /conflict` and `/tiering -> /conflict` can attach to an already-warmed conflict-grid dataset instead of bootstrapping from scratch.
- [x] Verify that a cache expiry or invalidate event makes the corresponding prefetch task eligible to refill rather than staying permanently suppressed.
- [ ] Verify that direct `/conflict` Lighthouse FCP, LCP, and TBT improve without changing the accepted raw-payload boundary or reintroducing server-shaped payload work.
- [ ] Verify that deferred timeline, KPI, and modal surfaces no longer participate in first-paint network or render-blocking CSS on direct `/conflict` loads.
- [ ] Verify that first-party code no longer triggers a meaningful legacy-JS finding on the modern-browser Lighthouse path.

## Recommended Execution Order

1. Keep P0-P2 as the landed foundation; do not reopen graph or worker-boundary work that those slices already settled.
2. Execute the new P3 before returning to graph-route worker-byte tuning, because the current browser-visible bottleneck is shared JS and eager `/conflict` entry work.
3. Use the already-landed shell reductions in P4 as the baseline and add only route-scoped follow-up shell cleanup discovered while stripping `/conflict` first paint.
4. Treat P5 and P6 as the follow-on validation lane once the modern build target and `/conflict` route split are stable.

## Success Criteria

The roadmap should be considered successful when the following are all true:

- a warmed `/bubble` or `/tiering` navigation actually skips first derived compute, not just payload fetch
- returning to `/conflict` from graph routes can attach to a warmed worker dataset rather than bootstrap from scratch
- no prefetch task is treated as complete after its underlying artifact has expired or been invalidated
- the local `/conflict` Lighthouse capture materially beats the current `~2.8s` FCP and `~3.1s` LCP baseline without changing the accepted remote payload boundary
- direct `/conflict` first paint is dominated by intentionally required table bootstrap work, with no third-party render-blocking assets and no closed modal or KPI surfaces on the cold path
- modern-browser Lighthouse no longer reports a major first-party legacy-JS burden, and no single first-party cold-entry chunk spends more than `~1.0s` in bootup evaluation
- the largest shared chunk, `/conflict` route chunk, and render-blocking CSS count are all materially lower, with direct `/conflict` blocking on at most two CSS files, and those budgets are enforced explicitly
- global cold-load cost is materially lower because route-specific runtime and third-party shell work have moved out of unconditional shell startup
