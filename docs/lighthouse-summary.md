# Lighthouse Summary

Updated on `2026-04-14` from the new matrix command `npm run lighthouse:matrix`, which runs a small representative route set against the built app on a temporary local server using Lighthouse `12.8.2`.

This supersedes the earlier optimistic single-route note. The new matrix lines up much more closely with the poor `conflict nation` Lighthouse behavior the user reported, so the current performance story is no longer “`/conflict` is basically solved except for GTM”. The built app still has a broad cold-entry first-party JS problem plus significant layout instability on the conflict route.

## Current Matrix

- Conflict coalition: score `44`, FCP `5.1s`, LCP `6.3s`, TBT `34ms`, CLS `0.501`, unused JS about `424 KiB`.
- Conflict nation: score `44`, FCP `5.1s`, LCP `6.2s`, TBT `27ms`, CLS `0.491`, unused JS about `404 KiB`.
- Tier / Time: score `57`, FCP `5.3s`, LCP `24.1s`, TBT `66ms`, CLS `0.120`, unused JS about `424 KiB`.
- Bubble / Time: score `59`, FCP `5.1s`, LCP `24.1s`, TBT `114ms`, CLS `0.097`, unused JS about `423 KiB`.
- AA vs AA: score `31`, FCP `5.4s`, LCP `5.6s`, TBT `3918ms`, CLS `0.135`, with a page-owned long task around `3436ms`.

## What This Means

- The hard-refresh tiering hang is fixed, and `scripts/verifyNavigation.mjs --report-perf` still shows `/conflict`, `/bubble`, and `/tiering` reaching app-ready in about `0.9-1.0s`. The user-visible gap is now between route-ready spans and Lighthouse/user-perceived paint stability, not a silent worker/bootstrap stall.
- The `/conflict` shell CSS work landed, but it did not remove the main cold-entry problem. `build/conflict.html` still modulepreloads a wide first-party graph, and the matrix reports roughly `404-434 KiB` of unused JS on the representative routes.
- GTM still costs tens of milliseconds, but it is not the dominant story anymore. The larger next slices are first-party route-entry JS ownership, layout stability on `/conflict`, the graph-route `24.1s` LCP mismatch, and the extremely heavy `/aava` main-thread work.

## Metric-Time Route-Ready Spot Check

Updated on `2026-04-21` from `npm run verify:navigation:perf` after metric-time gained a dedicated default-series prewarm path and coalition-mode cold-load coverage.

- Metric-time cold load: ready `947.7ms`, route transition `299.1ms`, first mount `315.4ms`, worker-bytes total `299.4ms`, graph compute `4.0ms`.
- Metric-time coalition cold load: ready `1483.4ms`, route transition `344.6ms`, first mount `364.2ms`, worker-bytes total `345.2ms`, graph compute `3.4ms`.

The important change is the route-span behavior, not the outer Playwright `ready` number by itself: metric-time default cold entry is back in the same rough route-transition band as bubble/tiering, and coalition mode is now a measured direct-entry path instead of a cold-only toggle branch.

## Reproduce

- `npm run build`
- `npm run lighthouse:matrix`
- `npm run verify:navigation:perf`
- Review `tmp/lighthouse-matrix/summary.md` and `tmp/lighthouse-matrix/summary.json`
