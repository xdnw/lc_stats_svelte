# CTOwned vs Locutus Interface Analysis

## Scope

This document is a second-pass, evidence-driven comparison between:

- the downloaded CTOwned pages under `H:\Github\ctowned`
- the current Locutus frontend in this repo as of April 12, 2026

The goal is to compare public-facing conflict analytics UX, design, capability, and data boundaries without carrying forward stale or overstated claims.

Sources reviewed include:

- CTOwned HTML and downloaded assets such as `H:\Github\ctowned\conflict.html`, `H:\Github\ctowned\graphs.html`, `H:\Github\ctowned\tier-graphs.html`, `H:\Github\ctowned\spy-graphs.html`, `H:\Github\ctowned\nation.html`, `H:\Github\ctowned\nation-graphs.html`, `H:\Github\ctowned\wars.html`, `H:\Github\ctowned\conflicts.html`, and `H:\Github\ctowned\conflict_files\main.js.download`
- current Locutus routes, shared components, data types, and grid infrastructure in `src/routes`, `src/components`, and `src/lib`
- the current latency roadmap and frontier in `docs/ACTIVE_FRONTIER.md` and `docs/roadmap.md`
- a fresh local production build via `npm run build`

Important limits:

- This is still a static analysis. It does not include live backend code for either site.
- For Locutus graph opportunities, this repo proves the rendering pipeline is generic, but it does not prove the full live contents of every published `GraphData.metric_names` payload beyond the metrics current routes already depend on.
- CTOwned includes both public conflict analytics and authenticated member/gov workflow surfaces. Some of its shell strength comes from that broader product scope, so not every convenience feature is a one-to-one comparison with the current public Locutus conflict analytics app.

## Corrections From The First Pass

These points needed correction or tighter wording.

### 1. Locutus does have global search

The app-wide navbar includes a real search form in `src/components/Navbar.svelte`.

What it does today:

- submits to `https://api.locutus.link/page/search/`
- provides page-level search
- is mounted globally through `src/routes/+layout.svelte`

What it does not appear to do today:

- in-app autocomplete
- recent-search history
- entity-first conflict / alliance / nation discovery from within the SPA shell

So the correct comparison is not "CTOwned has search, Locutus does not." The correct comparison is:

- CTOwned has a richer, integrated discovery shell
- Locutus has simpler external page search plus stronger in-route filtering once the user is inside conflict analytics

### 2. Conflict-table export is broader than the first draft implied

The first draft leaned too hard on route-local `ExportDataMenu` imports.

Correct view:

- graph routes such as `/bubble`, `/tiering`, and `/chord` expose direct route-level export menus
- table routes also expose export through the shared `DataGrid` toolbar in `src/lib/grid/GridToolbar.svelte`
- `DataGrid` is used on `/conflicts`, `/conflict`, and `/conflicts/view`

So export is a general Locutus capability, not something limited to the graph pages.

### 3. `/conflicts` is more capable than "just a table + timeline"

The current `/conflicts` route already includes:

- quick category filters
- alliance filtering via modal search
- pinned-alliance badges in the result details
- composite selection flow
- grid export through the shared `DataGrid`
- a timeline section

That makes it meaningfully more than a raw list page.

### 4. The conflict analytics data boundary needs one nuance

For analytics data, the current frontend mainly consumes three versioned static artifact families:

- `/conflicts/index.gzip`
- `/conflicts/<id>.gzip`
- `/conflicts/graphs/<id>.gzip`

But the app is not purely static-endpoint-only in every respect, because the navbar search points to a separate page-search API.

So the right wording is:

- conflict analytics are primarily powered by versioned static artifacts
- some shell functionality, such as page search, already uses a separate API

### 5. Nation detail is possible now, but only at aggregate level

The first draft was too generous about what a current-payload nation drilldown could do.

What the current conflict payload clearly supports:

- nation summary cards inside a conflict
- nation dealt / received / net totals
- attack / damage mix charts if corresponding headers exist
- relative-to-alliance or relative-to-coalition context

What it does not clearly support:

- per-war nation tables
- nation-vs-nation opponent tables
- attack logs
- war timeline for a single nation

So an in-conflict nation page is a real frontend-only opportunity, but it is an aggregate analytics page, not a war-log page.

### 6. CTOwned shell conveniences are actually implemented, not just present in markup

The downloaded custom JS in `H:\Github\ctowned\conflict_files\main.js.download` confirms that CTOwned actively implements:

- search autocomplete via `/api/search?q=...`
- recent search history in localStorage
- pinned pages and recently viewed pages in localStorage
- command palette / jump launcher on `Ctrl+K`
- notification summary and notification list fetches
- auth-aware nav and gov/member gating
- DataTables state save per user/path/table
- GET form state persistence in localStorage
- mobile quick-jump chip generation for tabsets
- mobile card-mode table behavior
- lazy spy-tab fetch from `/conflicts/<id>/spies?format=json`

That means the shell comparison can now be more confident and more specific.

## Executive Summary

CTOwned is better at immediate comprehension.

It gives users a stronger "answer first" experience through:

- a richer discovery shell
- faster nation-first drilldown
- per-war surfaces presented as first-class UI
- more prebuilt 2D charts and narrative summaries
- stronger repeat-user conveniences like autocomplete, recent pages, pinned pages, palette jump, and mobile quick-jump chips

Locutus is better at analytics infrastructure and long-term product shape.

It already has stronger foundations for a serious analytics SPA:

- worker-backed loading and transformation
- bounded caches and explicit prefetch coordination
- reusable grid, selection, export, preset, and KPI primitives
- route-level state persistence and shareable analysis URLs
- hover / focus / pointerdown tab prefetching
- composite conflict analysis
- generic war-web analysis through AAvA and chord

The most important product conclusion is not "copy CTOwned page-for-page."

It is this:

1. Keep Locutus' stronger architecture.
2. Add more low-interaction, opinionated summary views on top of the current data.
3. Treat nation history, war logs, and attack logs as data-publication work, not just frontend work.

## Apples-To-Apples Framing

Before comparing features, it helps to separate public conflict analytics from broader site scope.

| Area | CTOwned | Locutus |
| --- | --- | --- |
| Public conflict analytics | Yes | Yes |
| Public conflict discovery shell | Rich | Moderate |
| Authenticated member / gov workflow suite | Yes, visible in command palette and shell gating | Not part of this repo's public conflict analytics surface |
| External ecosystem links beyond conflict analytics | Present, but less visible in the public conflict pages reviewed | Present on home page via status, commands, chart/table builders, raid finder, multi checker |

So the fairest comparison is:

- compare public conflict analytics routes directly
- treat CTOwned's member/gov shell as additional context, not automatic parity work for Locutus

## Current Locutus Snapshot

### Shell and navigation

- Global navbar and footer via `src/routes/+layout.svelte`
- Global page search in `src/components/Navbar.svelte`
- Home page with animated branded landing surface plus ecosystem links in `src/routes/+page.svelte`
- Dark-mode cookie handling in `src/components/Navbar.svelte` and `src/app.html`

### Conflict index

- `/conflicts` offers quick category filters, alliance filtering, composite selection, grid export, and timeline rendering in `src/routes/conflicts/+page.svelte`

### Conflict detail

- `/conflict` supports coalition / alliance / nation layouts, KPI builder, presets, share/reset, and grid export through shared grid UI in `src/routes/conflict/+page.svelte`
- route tabs are shared by `src/components/ConflictRouteTabs.svelte`
- tab hover / focus / pointerdown warm likely next-route artifacts via `src/components/ConflictRouteTabs.svelte`

### Graph and war-web views

- `/aava` for pairwise alliance analysis
- `/tiering` for time/city-band charts
- `/bubble` for animated 3D scatter exploration
- `/chord` for alliance relationship web

### Composite support

- `/conflicts/view` provides merged multi-conflict analysis
- AAvA can remain enabled if the merged war-web is compatible
- bubble / tiering / chord are currently disabled on composite view

## Current CTOwned Snapshot

### Shell and navigation

The downloaded public pages consistently include:

- global search for nations, alliances, and conflicts
- search autocomplete and recent-search history
- pinned pages and recently viewed pages
- classic / non-classic mode toggle
- command palette (`Ctrl+K`)
- notification UI
- mobile quick-jump chips and mobile card-table behavior

### Conflict analytics structure

The conflict pages in the dump expose sections or tabs like:

- `Summary`
- `Dealt`
- `Received`
- `Units`
- `Loot`
- `Graphs`
- `Tier Effectiveness`
- `Spy War`
- `Alliance Leaderboard`
- `Nation Leaderboard`

### Nation drilldown

The nation pages in the dump expose:

- nation-level summary cards
- per-war damage charting
- attack mix
- war tables with clickable war ids
- dealt / received / units / loot breakdowns

### Additional shell/product scope

The command palette and nav code show CTOwned is broader than conflict analytics alone. It includes authenticated pages for:

- gov dashboards
- milcom dashboards
- econ dashboards
- spy dashboards
- tickets / interviews / audit / grants / loans / alliance extensions

That helps explain why its shell feels more like a full operating environment.

## Comparison

### 1. Discovery And Shell UX

#### CTOwned strengths

- search autocomplete and recent-search history
- pinned pages and recent pages
- command palette
- notification panel
- persistent table state and form state
- mobile quick-jump helpers
- more obviously stateful, repeat-user shell

#### Locutus strengths

- much cleaner shell
- lighter conceptual footprint
- branded home page with clear ecosystem links
- global page search already exists
- route-state shareability is stronger once the user is inside an analysis flow

#### Verdict

CTOwned is clearly stronger at shell-level repeat-user convenience.

Locutus is not empty here, but its shell is thinner and more intentionally minimal. The current gap is mostly in discovery depth and repeat-use conveniences, not in basic navigation existence.

### 2. Conflict Discovery And Index UX

This comparison is more balanced than the first draft suggested.

#### CTOwned strengths

- global entity search from anywhere
- recent/pinned navigation
- command palette access to many destinations

#### Locutus strengths

- `/conflicts` already has conflict-specific quick filters
- alliance filtering is built into the route
- pinned alliance badges give contextual filtering feedback
- composite compare flow starts directly from the index
- timeline is integrated into the same route
- grid export is built in

#### Verdict

- CTOwned is better at site-wide discovery.
- Locutus is already quite good at conflict-domain filtering once the user reaches `/conflicts`.

This matters because the roadmap should target the actual gap: better entry and discovery, not a full redesign of the conflict index.

### 3. Conflict Detail Storytelling

#### CTOwned strengths

- more prebuilt summary sections
- more immediate charts above the fold
- more narrative, less tool-like flow
- lower interaction cost for common questions

#### Locutus strengths

- much deeper analytical flexibility
- KPI builder and presets
- column management and reusable table tooling
- shareable URL state
- shared export infrastructure
- route tab prefetching and warmer integration

#### Verdict

- CTOwned is better at immediate storytelling.
- Locutus is better at exploratory and repeatable analysis.

The obvious opportunity is to add a CTOwned-style summary layer on top of the existing Locutus conflict route, not instead of it.

### 4. Nation And Per-War Analysis

This is the clearest current product gap.

#### CTOwned strengths

- dedicated nation pages inside a conflict
- per-war damage views
- war tables and war-id drilldown
- much stronger nation-first workflow

#### Locutus today

- nation rows exist in the conflict grid
- nation IDs, alliance mapping, names, and aggregate damage arrays exist in the current conflict payload
- there is no dedicated nation workflow in the public conflict UI
- there is no first-class per-war or per-attack public surface in this repo

#### Verdict

CTOwned is materially ahead here.

The right Locutus response should happen in two stages:

1. add aggregate nation dashboards with current data
2. separately publish war / attack datasets for true nation war history and per-war breakdowns

### 5. Visualization Style

#### CTOwned

- mostly 2D charts
- line / bar / donut charts dominate
- easier first read
- more suited to "tell me who is ahead" questions

#### Locutus

- more advanced exploratory views
- AAvA and chord are analytically strong
- bubble and tiering are flexible but less immediately readable to casual users
- graph routes are stronger as expert tools than as introductory narratives

#### Verdict

CTOwned is currently better at accessible default visualization.

Locutus should keep the advanced views, but it should lead with more readable 2D presets and summaries.

### 6. Frontend Architecture And Performance Shape

#### CTOwned

The downloaded site shows a conventional Bootstrap / jQuery / DataTables approach with custom shell JS layered on top.

Strengths:

- straightforward page behavior
- immediate table/chart setup
- lots of convenience features in one shell

Costs:

- repeated third-party asset loading across pages in the dump
- heavy page-local table/chart setup
- less clear ownership boundaries
- likely harder long-term maintenance story for complex analytics

#### Locutus

Strengths already in place:

- worker-backed conflict-grid bootstrap
- worker-backed composite context and composite grid work
- worker-backed AAvA selection engine
- route-aware warmers and artifact registry
- bounded caches and freshness-aware prefetching
- route-state shareability

Current build evidence from `npm run build` on April 12, 2026:

- a graph route entry chunk is still about `64.63 kB` (`23.73 kB` gzip)
- a large shared chunk is still about `225.51 kB` (`78.22 kB` gzip)
- the heaviest client chunk is still about `400.63 kB` (`134.17 kB` gzip)

So the architecture is strong, but there is still meaningful client weight.

#### Verdict

Locutus is clearly stronger architecturally.

CTOwned may still feel faster for some common questions because more route-specific answers are already shaped into simple 2D charts and tables.

This reinforces the main recommendation:

- keep the better architecture
- package more answers into low-interaction summary views

## Design Comparison

### CTOwned design language

- admin-dashboard aesthetic
- Bootstrap / Darkly conventions
- dense shell chrome
- lots of familiar widgets
- lower novelty, higher familiarity

This works well for power users who live in the site and want lots of obvious controls.

### Locutus design language

- stronger visual identity
- branded typography and background treatment
- cleaner tab system
- lighter, more custom-feeling shell

This is better brand-wise, but it currently asks more of the user to understand where to go next.

### Design verdict

- Locutus has the stronger visual identity.
- CTOwned has the stronger usability-by-familiarity shell.

The right direction is not to copy CTOwned's visual language. It is to preserve Locutus' identity while borrowing more of CTOwned's information architecture discipline.

## Data Reality: What Can Be Built Now

This section is intentionally conservative.

### A. Frontend-only with currently verified data

These are clearly supported by the current public conflict payloads and UI primitives.

#### 1. Better conflict overview dashboard on `/conflict`

Can build now from current conflict payload and grid summaries:

- top-level summary cards
- alliance summary bars
- nation summary bars
- damage composition views
- attack mix views when attack-related headers are present
- more visible preset summaries for consumption / units / loot / attacks

#### 2. In-conflict nation aggregate drilldown

Can build now from current `Conflict` payload:

- searchable nation directory within a conflict
- nation summary cards
- aggregate dealt / received / net views
- nation-relative ranking cards
- damage / attack mix charts at aggregate level

Cannot do yet from current public data alone:

- per-war nation tables
- attack logs
- pairwise nation opponent ledger

#### 3. Better table-driven convenience views

Can build now from the current table and preset infrastructure:

- stronger preset chips
- easier preset discovery
- conflict-summary cards derived from the same data the grid already uses
- selection-scoped summaries and shared report states

#### 4. Better war-web packaging

Can build now from current `war_web` support:

- attack-matrix views
- loot-matrix views
- resource-consumption matrix views
- attacker / defender initiation summaries
- top pairwise rivalry summaries at alliance level

### B. Likely frontend-only if already published in current `GraphData.metric_names`

The rendering engine is generic enough for these, but final availability depends on what the live graph payload currently publishes.

The repo gives higher confidence for at least these defaults:

- `nation`
- `dealt:loss_value`
- `loss:loss_value`
- `off:wars`

because current tiering / bubble defaults depend on them.

If the live graph payload includes the corresponding metrics, Locutus can likely add without new endpoints:

- alliance net damage per day
- coalition net damage per day
- daily war count views
- cumulative damage views
- resource consumption views
- loot views
- nuke views
- simpler tier-efficiency and momentum views
- more accessible 2D chart variants of existing graph data

### C. Requires new data publication or new endpoints

These should not be mislabeled as frontend work.

#### 1. Search for conflicts containing a nation

Needs a nation-to-conflict index or equivalent entity-search endpoint.

#### 2. All-time war performance for one nation

Needs cross-conflict nation history.

#### 3. Nation wars list inside a conflict

Needs first-class war summary records keyed by nation and conflict.

#### 4. Nation attack log inside those wars

Needs attack-log publication.

#### 5. Per-war net breakdown for an individual nation

Needs war summary rows or attack-log-derived war rollups.

#### 6. Nation-vs-nation opponent tables

Needs pairwise nation-level event or war data. The current public payload exposes nation aggregates, not opponent relationships.

#### 7. Full spy dashboard, if spy metrics are not already in live graph payloads

The repo does not prove that current public graph payloads publish spy-series data. If they do, this becomes frontend work. If they do not, it requires new publication.

## User Ideas Mapped To Current Reality

| Idea | Status | Notes |
| --- | --- | --- |
| More graphs for alliance performance | Yes | Clear frontend work with current payloads and graph/table infrastructure. |
| More graphs for individual performance inside one conflict | Yes, aggregate only | Can do aggregate nation dashboards now, not per-war logs. |
| Alliance net damage per day / momentum graph | Likely yes | The graph engine is generic, and current defaults already rely on damage and war metrics. |
| Strength tier graph by day | Yes | Current tiering route is already most of the way there. |
| Faster, easier-to-read 2D graph presets | Yes | Strong frontend opportunity. |
| Better graph accessibility | Yes | Strong frontend opportunity. |
| Nation view / nation tab inside a conflict | Yes, aggregate only | Good near-term target. |
| Search for conflicts with your nation | No | Needs nation-to-conflict data publication or endpoint. |
| All-time war performance of a single nation | No | Needs cross-conflict nation history. |
| List nation wars | No | Needs war summary data. |
| List nation attacks in those wars | No | Needs attack log data. |
| Net breakdown per war for an individual nation | No | Needs war-level data. |
| Full spy tab | Maybe | Frontend-only if spy metrics already exist in live graph payloads; otherwise needs new data publication. |

## What Locutus Can Do Better Than CTOwned

These are not parity items. They are opportunities to extend Locutus' current advantages.

### 1. Composite charting and report modes

Locutus already has real multi-conflict comparison infrastructure. Extending that into:

- comparison charts
- comparison summary cards
- reusable report presets

would create a capability CTOwned does not visibly match in the downloaded public sample.

### 2. Selection-scoped narrative analytics

Locutus is well-positioned to let a user:

- select alliances or nations
- get scoped charts and scoped summary cards
- share the exact state by URL

That can become a real differentiator.

### 3. Attack-quality and doctrine dashboards

The current preset and metric vocabulary already contains attack-quality-style concepts that are more specialized than typical summary pages.

This is a natural place for Locutus to go beyond CTOwned rather than chasing only parity.

## Recommended Product Direction

### 1. Add a better summary layer to `/conflict`

Highest-value near-term work:

- quick answer cards
- daily momentum / daily wars where current graph metrics allow it
- top alliances and nations
- clearer damage and attack composition blocks
- quick-jump chips to sections

This directly addresses the biggest usability gap without touching the underlying architecture.

### 2. Add in-conflict nation aggregate drilldown

Do this with current data first.

Include:

- nation search
- nation summary cards
- aggregate charts
- alliance-relative context

Do not pretend this is a war-log page until new war-level data exists.

### 3. Add more readable 2D presets on top of the current graph pipeline

Keep bubble and chord as advanced tools, but lead with:

- line charts
- bar charts
- stacked area charts
- textual summaries
- companion tables

### 4. Improve shell convenience selectively

The biggest shell gaps worth considering are:

- richer entity-aware search
- recent views or saved views
- better feature entry points
- optional command palette / launcher

But do this selectively. Not every CTOwned shell affordance is equally valuable for the current public Locutus scope.

### 5. Treat nation history and war logs as data work

If the roadmap wants:

- search by nation
- nation history
- nation war lists
- attack logs
- per-war nation breakdowns

then the next step is publication design, not UI polish.

## Bottom Line

The deeper second pass changes the conclusion in one important way.

The first draft was directionally right, but it understated two things:

1. Locutus already has more discovery, export, and conflict-index tooling than the first pass credited.
2. CTOwned's shell advantages are not superficial. They are backed by real implementation for search autocomplete, history, pinned/recent pages, palette navigation, mobile helpers, and state persistence.

The refined product take is:

- CTOwned is currently better at convenience, explanation, and nation/per-war storytelling.
- Locutus is already better at architecture, flexibility, shareability, and long-term analytical headroom.
- The best next move is to make Locutus easier to read before making it broader.

That means:

1. ship better summary views and 2D chart presets now
2. ship aggregate nation drilldown now
3. separately design and publish war-history / attack-history / nation-history data for the truly missing features
