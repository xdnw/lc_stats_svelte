# Active Frontier

Cross-session handoff for the current roadmap workstream.
Keep this file small and rewrite it whenever the frontier changes.

## Workstream

Navigation perf hardening for conflict-adjacent route entry and warmed tab transitions.

## Focus

- Shared `/conflict` entry now has an explicit `warmConflictRouteArtifacts(...)` helper in `src/lib/prefetchArtifacts.ts`, so callers use the reusable conflict-grid bootstrap path instead of ad hoc route-specific warm mixes.
- `src/components/ConflictRouteTabs.svelte` now routes conflict-layout tab intent through that shared helper, which keeps visible `/conflict` entry on the attachable bootstrap path instead of escalating pointerdown into aggressive grid prewarm.
- `src/routes/conflicts/+page.svelte` no longer speculatively warms `/bubble` and `/tiering` when opening a conflict card; the actual `Open Conflict Page` control now owns `/conflict` warm intent and only warms the destination the user is choosing.
- `scripts/verifyNavigation.mjs` now asserts that opening the conflict card and using `Open Conflict Page` do not leak graph-route warm activity onto the conflict-entry path, and its static-build probes were tightened to avoid stateful false negatives while keeping the branch-level perf matrix green.

## Latest Baseline

From targeted Vitest coverage, `npm run check`, `npm run build`, and `npm run verify:navigation:perf` on `2026-04-23`:

- Targeted tests pass:
  - `npm test -- src/lib/prefetchArtifacts.test.ts src/lib/conflictArtifactRegistry.test.ts src/lib/conflictGrid/workerClient.test.ts src/lib/prefetchCoordinator.test.ts`
- `npm run check` passes.
- `npm run build` passes.
- `npm run verify:navigation:perf` passes.
- Static-build perf verifier baseline currently reports:
  - `/conflict?id=33` ready around `879.5ms`
  - `/bubble?id=33` ready around `806.1ms`
  - `/tiering?id=33` ready around `744.5ms`
  - `/metric-time?id=33` ready around `764.1ms`
  - `/metric-time?id=33&aggregation=coalition` ready around `719ms`
  - `/aava?id=33` ready around `880.2ms`

## Remaining Acceptance Gaps

- None for the current navigation perf hardening workstream.

## Next Command

- None. Choose the next roadmap workstream before further investigation.

## Last Verified Command

- `npm test -- src/lib/prefetchArtifacts.test.ts src/lib/conflictArtifactRegistry.test.ts src/lib/conflictGrid/workerClient.test.ts src/lib/prefetchCoordinator.test.ts`
- `npm run check`
- `npm run build`
- `npm run verify:navigation:perf`

## Blocker

- None.

## Replace This File When

- Replace it when a new highest-priority roadmap workstream is selected.
