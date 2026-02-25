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

## Validation Checklist

- Confirm first route no longer pulls DataTables or Plotly unless required by the active route.
- Confirm cross-route prefetches are skipped on constrained clients (`saveData`, slow connection, low memory).
- Confirm decompression worker fallback counters remain near zero on modern browsers.
- Confirm no feature regressions in query restore, table export, column customization, and graph interactions.
