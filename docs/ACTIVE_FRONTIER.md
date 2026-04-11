# Active Frontier

Cross-session handoff for the current roadmap workstream.
Keep this file small and rewrite it whenever the frontier changes.

## Workstream

Shared-grid `All`-mode mixed-height scroll stability is now closed.

## Focus

`src/lib/grid/DataGrid.svelte` no longer lets later `All`-mode slabs rewrite the global row-height estimate. The grid now seeds one baseline row height per meaningful `All` view state (sort/filter/visible-column set) and reuses that baseline for subsequent virtual-window math, so tall wrapped rows no longer cause spacer recalculation to jump the scroll position backward or strand the viewport on blank content. `src/lib/grid/virtualization.ts` now owns the pure `resolveGridRowHeightEstimate(...)` helper with focused coverage, and `DataGrid.svelte` also now skips its summary-paint `requestAnimationFrame(...)` hop during SSR so server-rendered in-memory routes do not crash when they instantiate a provider eagerly.

## Remaining Acceptance Gaps

- None for the shared-grid `All`-mode mixed-height scroll bug.
- If another `All`-mode scroll regression appears, inspect whether the new issue is a baseline-estimate problem, a true variable-height cumulative-offset problem, or a paint/compositor bottleneck before increasing slab size or reintroducing per-scroll estimate updates.

## Next Command

`npx vite dev --host localhost --port 4173`

## Last Verified Command

- `npm run check`
- `npm run build`
- Targeted tests: `src/lib/grid/virtualization.test.ts`
- Live validation on `http://localhost:4173/grid-scroll-probe`: `All` mode over a mixed-height in-memory dataset kept `blankSamples = 0` and `backwardsJumps = 0` across 18 deep scroll steps, with the rendered row slab remaining populated the whole way.

## Blocker

- None.

## Replace This File When

- A new shared-grid regression, profiling slice, or blocker changes the active workstream.
