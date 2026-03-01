# Main Route Performance Baseline

This file defines baseline capture and target budgets for the main routes:

- `/`
- `/conflicts`
- `/conflict?id=<sample>`
- `/aava?id=<sample>`
- `/bubble?id=<sample>`
- `/tiering?id=<sample>`
- `/chord?id=<sample>`

Use one stable `id` for all conflict-scoped routes when comparing runs.

## Budgets (initial targets)

| Metric | / | /conflicts | /conflict | /aava | /bubble | /tiering | /chord |
|---|---:|---:|---:|---:|---:|---:|---:|
| TTI (ms) | 1800 | 2600 | 3000 | 3000 | 3200 | 3200 | 3000 |
| Long tasks >50ms (count) | <= 4 | <= 8 | <= 8 | <= 8 | <= 10 | <= 10 | <= 8 |
| Main-thread scripting (ms) | <= 700 | <= 1300 | <= 1500 | <= 1500 | <= 1700 | <= 1700 | <= 1400 |
| Route switch latency (ms) | <= 450 | <= 650 | <= 650 | <= 650 | <= 700 | <= 700 | <= 650 |
| JS heap after settle (MB) | <= 120 | <= 180 | <= 200 | <= 200 | <= 240 | <= 240 | <= 200 |

## Capture Protocol

1. Build and serve production output (`npm run build`, then `npm run preview`).
2. Use Chrome DevTools Performance panel, disable cache, and run 3 samples per route.
3. For route-switch latency, start on `/conflict?id=<sample>` and switch across sibling tabs.
4. Record median and p95 for each metric.
5. Repeat after changes and compare against this baseline.

## Instrumentation Hooks

The app now exposes lightweight perf events and counters at `window.__lcPerf`.

Quick inspector snippet:

```js
const snapshot = window.__lcPerf?.snapshot?.();
console.table(snapshot?.events ?? []);
console.table(snapshot?.counters ?? []);
```

Reset between runs:

```js
window.__lcPerf?.clear?.();
```

Key event/counter names:

- `decompress.request`
- `decompress.worker.total`
- `decompress.main.total`
- `decompress.cache.hit`
- `decompress.worker.fallback`
- `table.setupContainer`
- `graph.plotly.react`
- `graph.tiering.setupCharts`
- `graph.chord.setupLayout`
- `prefetch.success`
- `prefetch.failed`
- `prefetch.skipped`
- `conflict.layout.compute`
- `conflict.layout.apply`
- `conflict.layout.preset.apply`
- `conflict.layout.columnPreset.apply`
- `conflict.layout.cache.hit`
- `conflict.layout.cache.miss`
- `conflict.layout.cache.invalidate`

Journey-specific event/counter names (`conflicts -> conflict -> bubble`):

- `journey.conflicts_to_conflict.navMode` (counter with `mode=spa|document-or-new-tab`)
- `journey.conflicts_to_conflict.routeTransition`
- `journey.conflicts_to_conflict.dataFetch`
- `journey.conflicts_to_conflict.firstMount`
- `journey.conflict_to_bubble.routeTransition`
- `journey.conflict_to_bubble.dataFetch`
- `journey.conflict_to_bubble.runtimeLoad`
- `journey.conflict_to_bubble.firstMount`
- `worker.bubble.clone.ms`
- `worker.bubble.receive.ms`
- `worker.bubble.compute.ms`
- `worker.bubble.respond.ms`

## Journey Targets

Primary journey: `/conflicts -> /conflict?id=<sample> -> /bubble?id=<sample>`

Cold (hard refresh on `/conflicts`, empty memory cache):

- `journey.conflicts_to_conflict.routeTransition` p50 <= 450ms, p95 <= 800ms
- `journey.conflicts_to_conflict.dataFetch` p50 <= 1300ms, p95 <= 2200ms
- `journey.conflict_to_bubble.routeTransition` p50 <= 500ms, p95 <= 900ms
- `journey.conflict_to_bubble.dataFetch` p50 <= 1500ms, p95 <= 2500ms
- `journey.conflict_to_bubble.runtimeLoad` p50 <= 300ms, p95 <= 700ms

Warm (repeat navigation, cached payload/runtime expected):

- `journey.conflicts_to_conflict.routeTransition` p50 <= 220ms, p95 <= 450ms
- `journey.conflicts_to_conflict.dataFetch` p50 <= 120ms, p95 <= 280ms
- `journey.conflict_to_bubble.routeTransition` p50 <= 260ms, p95 <= 520ms
- `journey.conflict_to_bubble.dataFetch` p50 <= 150ms, p95 <= 320ms
- `journey.conflict_to_bubble.runtimeLoad` p50 <= 90ms, p95 <= 180ms
- `worker.bubble.clone.ms` median should be lower than pre-protocol baseline (init+param protocol)

## Validation Checklist

- Confirm first route no longer pulls DataTables or Plotly unless required by the active route.
- Confirm cross-route prefetches are skipped on constrained clients (`saveData`, slow connection, low memory).
- Confirm decompression worker fallback counters remain near zero on modern browsers.
- Confirm no feature regressions in query restore, table export, column customization, and graph interactions.

## Conflict KPI/Preset Acceptance Signals

Use a large `conflict?id=<sample>` with nation layout selected and many KPI widgets.

- Baseline capture:
1. `window.__lcPerf.clear()`.
2. Apply a nation preset from layout picker and then from `My layouts`.
3. Open KPI builder, add/reorder several ranking/metric widgets, and close.
4. Collect `window.__lcPerf.snapshot()`.

- Post-change expectations:
1. `conflict.layout.cache.hit` should dominate over `conflict.layout.cache.miss` during repeated preset toggles with the same raw payload.
2. `conflict.layout.preset.apply` and `conflict.layout.columnPreset.apply` spans should no longer coincide with multi-second main-thread stalls.
3. `table.incremental.reuse` should remain higher than `table.incremental.rebuild` for preset/sort/order churn where schema is unchanged.

## Conflict Pipeline Refactor Baseline (2026-03-01)

Scope locked for:

- `/aava?id=<single>`
- `/aava?ids=<id,id>&aid=<aid>`
- `/conflicts/view?ids=<id,id>&aid=<aid>`

Fixture used for capture:

- Single: `id=156`
- Composite: `ids=158,147,146,136,128,127,93,21,16,7&aid=11657`
- Samples: 3 runs per scenario (median reported)

### Verification snapshot

| Check | Pre-refactor | Post A–D refactor |
|---|---|---|
| `npm run check` | ✅ pass (0 errors, 0 warnings) | ✅ pass (0 errors, 0 warnings) |
| `npm run build` | ❌ fail: prerender error at `/aava` (`url.searchParams` access) | ❌ fail: prerender error at `/bubble` (existing); `/aava` prerender error removed |

### Scenario baseline table

| Scenario | Conflict load duration | `mergeCompositeConflict` duration | First table render duration | Warning count/messages |
|---|---:|---:|---:|---|
| `/aava?id=156` | 32.2 ms | n/a | 13.2 ms | `0` warnings |
| `/aava?ids=158,147,146,136,128,127,93,21,16,7&aid=11657` | 277.4 ms | 43.2 ms | 19.5 ms | `1` warning: `Composite merge warnings: 1474` |
| `/conflicts/view?ids=158,147,146,136,128,127,93,21,16,7&aid=11657` | 43.7 ms | 43.5 ms | 26.4 ms | `1` warning: `Merge warnings detected. 1474 warnings` |

Notes:

- Manual timings should be captured in production preview (`npm run build` + `npm run preview`) with a fixed fixture for each scenario.
- For warning parity checks, compare message text and count against the same composite fixture before/after.
- Current captures were taken on `npm run dev`; absolute values are environment-sensitive, but parity and relative comparisons are stable for this fixture.
- For `/conflicts/view`, conflict payload fetch/decompress occurs in page-local preload (`loadConflicts`) before merge-context orchestration, so the reported conflict-load timing reflects context orchestration stage rather than full network+decode wall time.
