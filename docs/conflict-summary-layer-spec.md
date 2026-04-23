# /conflict Overview Plan

## Scope

This plan covers the single-conflict `/conflict` route.

It defines:

- the role of a route-level `Overview` section
- the intended information architecture around the table
- the exact quick-answer surfaces the route should provide
- the split between `Overview`, `DataGrid`, `KPI`, and deeper routes
- what should ship from current data
- what tiny additions are worth publishing into the current detail artifact path
- what belongs to larger data-publication work instead

It does not cover:

- composite `/conflicts/view` parity
- per-war drilldown pages
- nation-history or attack-history publication
- shell-wide discovery features outside the conflict-detail route

## Product Goals

- reduce time-to-first-understanding on `/conflict`
- preserve the table as the main analytical workspace
- keep first paint on the current conflict-detail artifact path
- point users into stronger existing drilldowns instead of recreating them in place
- stay dense on desktop and controlled on mobile
- preserve existing shareability and route-state behavior

## Non-Goals

- a new top-level tab on the conflict route family
- a fourth layout mode alongside coalition, alliance, and nation
- a second customizable KPI system
- a dashboard replacement for `Tier/Time`, `Bubble`, `Web`, or `AA vs AA`
- a first-load dependency on a second endpoint or a second blocking artifact fetch
- per-war, per-attack, or cross-conflict entity discovery

## Route Structure

The `/conflict` route should be structured in this order:

1. breadcrumbs and page title
2. coalition / alliance / nation layout picker
3. existing control bar for layout presets, columns, share/reset, and advanced KPI entry
4. section jump row
5. `Overview`
6. `DataGrid`
7. advanced `KPI` section
8. `Status` and `Casus Belli` when present
9. timeline

The layout picker remains a table-aggregation control.
It does not become a mixed layout-plus-overview tab strip.

The `Overview` remains conflict-wide and does not change when the user switches between coalition, alliance, and nation layout.
Only the table changes.

## Section Jump Row

`/conflict` should expose a compact jump row for visible sections.

Target labels:

- `Overview`
- `Table`
- `KPI` when the advanced KPI section is present
- `Status` when present
- `CB` when present
- `Timeline` when present

Rules:

- this is anchor navigation, not a new tab system
- chips are generated only for rendered sections
- the row should be horizontally scrollable on mobile
- the row should stay visually lightweight enough that it does not compete with the layout/control bar above it
- the row should not introduce new share-state or query-state semantics

## Overview State Model

`Overview` is a route-level section, not a mode.

Rules:

- expanded or collapsed state is local UI state
- collapse state persists locally
- collapse state is not part of shared analysis URL state
- the overview is conflict-wide, not filter-scoped and not selection-scoped
- overview content does not change when the table filter, sort, page, or selection changes
- overview deep links may set route state on destination pages only when those routes already support it

The overview should feel stable while the table remains exploratory.

## Relationship To Existing Surfaces

### Overview

`Overview` is:

- fixed-content
- route-owned
- conflict-wide
- optimized for first-read comprehension
- intentionally low-control

### DataGrid

`DataGrid` remains:

- the primary work surface
- layout-specific
- filterable and sortable
- exportable
- selection-aware

### KPI

`KPI` remains:

- advanced
- user-composable
- optionally selection-scoped
- shareable through existing route state

### Deeper routes

These remain the heavy drilldown surfaces:

- `AA vs AA` for selected pairwise matchup analysis
- `Web` for relationship structure
- `Tier/Time` for time-series and tier views
- `Bubble` for outlier and distribution analysis

The overview should send users to those routes when the question becomes too large for a compact answer.

## Advanced KPI Placement

Once `Overview` exists, the advanced KPI section should sit below the table and start collapsed by default.

The control bar can keep the advanced KPI entry point.

Behavior target:

- `Overview` above the grid handles fixed first-read summaries
- `DataGrid` stays immediately reachable
- `KPI Builder` remains available from the control bar
- opening or saving KPI configuration expands the KPI section and scrolls it into view when necessary

## Overview Composition

`Overview` should be one dense surface with four bands.

1. `Scoreline`
2. `Main Analysis Row`
3. `Context Strip`
4. `Trend Strip` when available

On desktop, these bands may share a single container with internal separators.
On mobile, they stack vertically and the entire overview starts collapsed by default.

## Quick Answers

The overview should answer the following questions and no more.

| Question | Surface | Primary data source | Default follow-up |
| --- | --- | --- | --- |
| Who leads, and by how much? | Scoreline | `ConflictGridPresetMetrics` | `Summary` table preset |
| How active is the conflict? | Scoreline + Coalition Compare | `warsTracked`; `active_wars` when available | `Timeline` |
| Which alliances are driving the result? | Key Contributors | current alliance ranking query | `Alliance` layout |
| Which nations are driving the result? | Key Contributors | current nation ranking query | `Nation` layout |
| Where is the highest-volume matchup? | Context Strip | `war_web` | `AA vs AA` or `Web` |
| What damage profile dominates? | Context Strip | current damage buckets | `Dealt` / `Received` / `Units` / `Consumption` presets |
| Has the lead been stable recently? | Trend Strip | `daily_summary` or non-blocking graph data | `Tier/Time` |

If the route cannot answer one of these cleanly with current or explicitly published data, the question is omitted from the overview and answered by a drilldown CTA instead.

## Band 1: Scoreline

The scoreline is the highest-priority overview band.

It should render as one dense row, not a grid of isolated cards.

Contents:

- lead sentence
- total damage exchanged
- damage gap
- wars tracked
- duration
- active wars when available
- freshness label when `updateMs` is available

Lead sentence format:

- `{leading coalition} leads by {damage gap} net damage`
- when the conflict is effectively tied, render neutral wording rather than inventing a leader

Display rules:

- the lead sentence is the only prose sentence in the scoreline
- the remaining items render as compact labeled stat pairs or chips
- scoreline items wrap on smaller widths instead of expanding into large card blocks
- freshness, when shown, renders as muted metadata rather than a primary statistic

## Band 2: Main Analysis Row

The main analysis row has two panes:

- `Coalition Compare`
- `Key Contributors`

### Coalition Compare

This pane is a compact scoreboard, not a chart collection.

Rows:

- dealt
- received
- net
- wars
- active wars when available

Columns:

- coalition 1
- coalition 2

Presentation:

- numeric values remain primary
- short inline bars may be used when they improve scanning
- coalition naming and coloring should reuse the route's existing coalition conventions
- there are no sorting, filtering, or local toggles in this pane

### Key Contributors

This pane answers which entities are driving the conflict result.

It contains two microtables:

- top alliances
- top nations

Display target:

- top 3 alliances
- top 5 nations

Each row should include:

- entity name
- coalition indicator
- primary value

Phase 1 primary value:

- `net:damage`

Tie-breaker:

- `dealt:damage`

Rules:

- use one consistent metric for the initial release
- do not add a local sort or metric switcher to the overview
- if ranking rows are still hydrating, reserve compact skeleton space rather than shifting the whole layout later
- each table has one CTA only: `Open Alliance table` or `Open Nation table`

The destination should use existing layout state and current route conventions rather than inventing new leaderboard pages inside `/conflict`.

## Band 3: Context Strip

The context strip is a compact factual band beneath the main analysis row.

It carries:

- `Key Matchup`
- `Damage Profile`
- drilldown actions

### Key Matchup

This is the preferred current-data bridge into `AA vs AA` or `Web`.

Definition priority:

1. use `war_web.headers` entry `wars` when available
2. otherwise use `loss_value` when available
3. otherwise use the current default war-web header

The strip should summarize a single top cross-coalition alliance pair.

Format target:

- `{Alliance A} vs {Alliance B} is the highest-volume matchup by {metric}`

Optional secondary value:

- share of the selected metric across all cross-coalition alliance pairs

Deep link behavior:

- primary CTA: `Open in AA vs AA`
- secondary CTA: `Open Web` only when useful

`AA vs AA` deep links may prefill existing route parameters:

- `header`
- `pc`
- `pids`
- `vids`

No matrix or selector UI belongs inside the overview.

### Damage Profile

Phase 1 should ship a damage profile, not a raw attack-taxonomy block.

Derived buckets should reuse current table vocabulary rather than introducing a second metric language.

Preferred grouped buckets:

- infra
- units
- consumption
- loot
- other

Presentation target:

- one thin stacked bar and top labels, or
- one compact ranked list of the top three buckets

Only one representation is needed.

The overview should not show raw attack breakdown codes such as the detailed `Attacks` preset categories.
Those belong in the table, not in the overview.

### Attack Profile Boundary

A compact attack profile does not belong in phase 1 unless the existing attack columns are first grouped into stable families.

Required family grouping:

- ground
- air
- naval
- missile
- nuke
- additional families only if clearly stable and compact

Until that grouped family mapping exists, the overview should use a CTA to `Open Attacks preset` rather than rendering a noisy attack block.

### Drilldown Actions

The context strip is also where overview-level CTAs belong.

Target CTA set:

- `Open Summary`
- `Open Alliance table`
- `Open Nation table`
- `Open Dealt`
- `Open Received`
- `Open Units`
- `Open Consumption`
- `Open Attacks`
- `Open in AA vs AA`
- `Open in Tier/Time`
- `Open Web`
- `Open Bubble` only when an outlier-oriented follow-up is warranted

These actions should map to existing Locutus primitives.
They should not create a second in-route navigation model with `Summary`, `Dealt`, `Received`, `Units`, `Loot`, `Graphs`, or dedicated leaderboard tabs.

## Band 4: Trend Strip

The trend strip is optional and should not block phase 1.

When present, it stays narrow and single-purpose.

Phase 2 default:

- `Daily damage swing`

Labeling:

- product label: `Daily damage swing`
- acceptable secondary label: `Recent lead swing`
- avoid the label `momentum` in the UI

Formula:

`daily_damage_swing[d] = coalition_1_daily_dealt_damage[d] - coalition_2_daily_dealt_damage[d]`

Interpretation:

- positive values favor coalition 1 that day
- negative values favor coalition 2 that day
- zero indicates no clear daily damage advantage

Optional smoothed helper:

`momentum_3d[d] = average(daily_damage_swing[d-2..d])`

If a smoothed helper exists internally, it remains a presentation aid rather than the primary user-facing label.

`Daily wars` does not need its own overview toggle in phase 2.
If it is not essentially free inside the same compact strip, it remains a `Tier/Time` drilldown topic.

## Drilldown Mapping

The overview should translate first-read intents into existing route surfaces.

| Intent | Destination | Route behavior |
| --- | --- | --- |
| quick overall standings | current page | overview + table |
| dealt / received / units / consumption breakdown | current table presets | local preset switch |
| alliance leaderboard | `Alliance` layout | preserve conflict route state |
| nation leaderboard | `Nation` layout | preserve conflict route state |
| highest-volume rivalry | `AA vs AA` | prefill matchup params when available |
| relationship structure | `Web` | route jump only |
| timeline / trend | `Tier/Time` | route jump only |
| outlier distribution | `Bubble` | route jump only |

## Visual Requirements

`Overview` should read as a dense briefing strip, not as a generic dashboard.

Preferred primitives:

- scoreline row
- comparison table
- microtables
- thin bars
- compact metadata labels
- one narrow chart strip when trend data exists

Avoid:

- six to ten detached stat cards
- repeated subheads and explanatory blurbs inside every box
- large empty padding blocks
- mobile-only card stacks with worse density than the desktop version
- drag/drop, metric switches, or local filters inside the overview

Height target:

- desktop expanded overview should stay roughly within one short screen band
- mobile expanded overview should remain readable as a stacked sequence and default collapsed

## Loading And Performance Behavior

The overview should load in stages without blocking the table.

### First paint

Render immediately from the current conflict-table bootstrap path:

- scoreline
- coalition compare
- static jump row

Data source:

- `ConflictGridBootstrapPayload.meta`
- `ConflictGridBootstrapPayload.presetMetrics`

### Secondary hydrate

Hydrate after the worker-backed route is ready:

- top alliances
- top nations
- key matchup
- damage profile

Data source:

- current ranking queries
- current conflict payload fields already owned by the route or worker dataset

### Optional lazy hydrate

Only after first paint and only when data is already available or explicitly published into the same artifact path:

- trend strip

Hard rules:

- no second blocking fetch for first paint
- no dependency on `/conflicts/graphs/<id>.gzip` for phase 1 overview rendering
- avoid large layout jumps while secondary items hydrate
- omit missing modules rather than showing large empty placeholders

## Data Sources Available Today

The current route can already support most of the overview from existing data.

### Current detail/bootstrap path

Available now:

- conflict name, dates, CB, status, posts, and optional `updateMs`
- coalition names and alliance rosters
- conflict-wide dealt / received / net / wars via bootstrap preset metrics
- route-level worker ranking queries for alliance and nation rows
- `damage_header` and `header_type`
- `war_web.headers` and `war_web.data`

### Current graph path

Available now, but should remain non-blocking for overview work:

- daily and turn-based graph series from `/conflicts/graphs/<id>.gzip`
- proven metric usage for at least `nation`, `dealt:loss_value`, `loss:loss_value`, and `off:wars`

## Data Contract Boundary

`ConflictGridPresetMetrics` is enough for the phase 1 scoreline and compare bands.

If `/conflict` needs more first-paint overview fields beyond KPI semantics, add a separate overview-focused object to `ConflictGridBootstrapPayload` rather than turning `presetMetrics` into a miscellaneous overview bag.

Preferred future shape:

- keep `presetMetrics` for KPI compatibility
- add `overviewSummary` for route-owned overview data when first-paint requirements extend beyond the current preset metrics

## Features That Should Ship From Current Data

Phase 1 features that are already supported by current route data and worker capabilities:

- scoreline
- coalition compare
- top alliance microtable
- top nation microtable
- key matchup from `war_web`
- damage profile from grouped current damage buckets
- jump row
- overview drilldown actions into current table presets and route family pages

Phase 1 feature that should not ship from raw current data without extra grouping work:

- attack profile

The current attack breakdown is too detailed and code-like to belong in the overview without a stable family grouping.

## Tiny Additions Worth Publishing Into The Current Detail Path

These additions are small enough to fit the current detail artifact strategy and should not require a separate first-load endpoint.

### 1. `active_wars`

Purpose:

- improve the activity answer in the scoreline and compare bands

Preferred location:

- detail payload and route meta

### 2. `daily_summary`

Purpose:

- support the optional trend strip without a second blocking fetch

Preferred shape:

- day range
- coalition 1 daily dealt damage
- coalition 2 daily dealt damage
- coalition 1 daily offensive wars
- coalition 2 daily offensive wars

This supports `Daily damage swing` immediately and leaves `Daily wars` available without loading the full graph artifact.

### 3. `attack_family_summary` when a compact attack profile is desired

Purpose:

- allow a stable overview attack profile without exposing raw attack breakdown codes or rebuilding a brittle grouping map in the client

Preferred shape:

- coalition 1 family totals
- coalition 2 family totals
- families limited to the compact set required by the overview

This is optional.
Phase 1 can ship without it by using only a damage profile plus the `Attacks` preset CTA.

## Work That Requires Larger Publication Or Endpoints

The following do not belong to the route-level overview plan and should be treated as separate data-publication work:

- nation search across conflicts
- all-time nation history
- nation war lists within a conflict
- per-war nation rollups
- nation-vs-nation opponent ledgers
- attack logs
- per-attack history
- full war-log storytelling surfaces

## Implementation Boundary

The clean ownership boundary is:

- route code owns data loading and derived view-model assembly
- a dedicated `Overview` component renders read-only view data
- KPI remains a separate component and state model
- overview data does not create new local-storage schemas beyond collapsed state

A reasonable component boundary is a route-owned `ConflictOverview` view component that receives:

- route meta
- first-paint overview summary data
- contributor rows
- matchup summary
- damage profile
- optional trend summary
- CTA descriptors

The component does not own worker queries or route state.

## Release Plan

### Phase 1

Ship from current route data:

- `Overview` section
- jump row
- scoreline
- coalition compare
- top alliances
- top nations
- key matchup
- damage profile
- drilldown actions to table presets and current route family pages
- advanced KPI below the table, collapsed by default

### Phase 1.5

Add tiny detail-path data:

- `active_wars`

### Phase 2

Add tiny same-artifact summary series:

- `daily_summary`
- trend strip with `Daily damage swing`

### Phase 2.5

Add compact attack-family publication only if attack profile still belongs in the overview:

- `attack_family_summary`

### Phase 3

Treat larger drilldown features as separate workstreams:

- nation detail
- per-war detail
- attack history
- cross-conflict entity discovery

## Final End State

`/conflict` should open with a compact `Overview` that explains the conflict in one short band, hands off cleanly to the table, and points into stronger drilldowns only when the question outgrows a compact answer.

The route should remain a conflict-analysis page with:

- a stable conflict-wide overview
- a powerful table immediately underneath it
- advanced KPI below the table
- current drilldown routes used intentionally instead of redundantly