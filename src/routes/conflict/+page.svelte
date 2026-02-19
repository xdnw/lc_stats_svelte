<script lang="ts">
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import { onMount } from "svelte";
    import {
        addFormatters,
        decompressBson,
        formatDate,
        setupContainer,
        computeLayoutTableData,
        getPageStorageKey,
        type Conflict,
        setQueryParam,
        formatDuration,
        type TableData,
        ExportTypes,
        downloadTableElem,
        applySavedQueryParamsIfMissing,
        saveCurrentQueryParams,
        resetQueryParams,
        formatDatasetProvenance,
        formatAllianceName,
        trimHeader,
    } from "$lib";
    import {
        makeKpiId,
        readSharedKpiConfig,
        saveSharedKpiConfig,
        sanitizeKpiWidget,
        buildLegacyKpiWidgets,
        moveWidgetByDelta,
        moveWidgetToIndex as moveWidgetToIndexInList,
        type ConflictKPIWidget,
        type MetricCard,
        type PresetCard,
        type PresetCardKey,
        type RankingCard,
        type AavaScopeSnapshot,
        type ScopeSnapshot,
        type WidgetEntity,
        type WidgetScope,
    } from "$lib/kpi";
    import { getAavaMetricLabel } from "$lib/aava";
    import { getVisGlobal, setWindowGlobal } from "$lib/globals";
    import ColumnPresetManager from "../../components/ColumnPresetManager.svelte";
    import { config } from "../+layout";

    const Layout = {
        COALITION: 0,
        ALLIANCE: 1,
        NATION: 2,
    };

    type KPIWidget = ConflictKPIWidget;

    let conflictName = "";
    let conflictId: string | null = null;
    let _loaded = false;
    let _loadError: string | null = null;
    let datasetProvenance = "";
    let _rawData: Conflict | null = null;

    let breakdownCols = [
        "GROUND_TANKS_MUNITIONS_USED_UNNECESSARY",
        "DOUBLE_FORTIFY",
        "GROUND_NO_TANKS_MUNITIONS_USED_UNNECESSARY",
        "GROUND_NO_TANKS_MUNITIONS_USED_UNNECESSARY_INACTIVE",
        "GROUND_TANKS_NO_LOOT_NO_ENEMY_AIR_INACTIVE",
        "GROUND_TANKS_NO_LOOT_NO_ENEMY_AIR",
        "AIRSTRIKE_SOLDIERS_NONE",
        "AIRSTRIKE_SOLDIERS_SHOULD_USE_GROUND",
        "AIRSTRIKE_TANKS_NONE",
        "AIRSTRIKE_SHIP_NONE",
        "AIRSTRIKE_INACTIVE_NO_GROUND",
        "AIRSTRIKE_INACTIVE_NO_SHIP",
        "AIRSTRIKE_FAILED_NOT_DOGFIGHT",
        "AIRSTRIKE_AIRCRAFT_NONE",
        "AIRSTRIKE_AIRCRAFT_NONE_INACTIVE",
        "AIRSTRIKE_AIRCRAFT_LOW",
        "AIRSTRIKE_INFRA",
        "AIRSTRIKE_MONEY",
        "NAVAL_MAX_VS_NONE",
    ].map((col) => `off:${col.toLowerCase().replaceAll("_", " ")} attacks`);

    let layouts: { [key: string]: { sort: string; columns: string[] } } = {
        Summary: {
            sort: "off:wars",
            columns: [
                "name",
                "net:damage",
                "off:wars",
                "def:wars",
                "dealt:damage",
                "loss:damage",
            ],
        },
        Dealt: {
            sort: "dealt:damage",
            columns: [
                "name",
                "dealt:infra",
                "dealt:~$soldier",
                "dealt:~$tank",
                "dealt:~$aircraft",
                "dealt:~$ship",
                "dealt:~$unit",
                "dealt:~$consume",
                "dealt:~$loot",
                "dealt:damage",
            ],
        },
        Received: {
            sort: "loss:damage",
            columns: [
                "name",
                "loss:infra",
                "loss:~$soldier",
                "loss:~$tank",
                "loss:~$aircraft",
                "loss:~$ship",
                "loss:~$unit",
                "loss:~$consume",
                "loss:~$loot",
                "loss:damage",
            ],
        },
        Units: {
            sort: "dealt:~$unit",
            columns: [
                "name",
                "dealt:soldier",
                "dealt:tank",
                "dealt:aircraft",
                "dealt:ship",
                "dealt:~$unit",
                "loss:soldier",
                "loss:tank",
                "loss:aircraft",
                "loss:ship",
                "loss:~$unit",
                "net:~$unit",
            ],
        },
        Consumption: {
            sort: "name",
            columns: [
                "name",
                "loss:~$building",
                "loss:gasoline",
                "loss:munitions",
                "loss:steel",
                "loss:aluminum",
                "loss:consume gas",
                "loss:consume mun",
            ],
        },
        Attacks: {
            sort: "off:attacks",
            columns: ["name", "off:attacks", ...breakdownCols],
        },
    };

    let _layoutData = {
        layout: Layout.COALITION,
        columns: layouts.Summary.columns,
        sort: layouts.Summary.sort,
        order: "desc",
    };

    let _currentRowData: TableData;
    const getVis = (): any => getVisGlobal();

    const DEFAULT_PRESET_CARDS: PresetCard[] = [
        { id: "preset-duration", kind: "preset", key: "duration" },
        { id: "preset-total-dmg", kind: "preset", key: "damage-total" },
        { id: "preset-net-gap", kind: "preset", key: "net-gap" },
    ];

    const DEFAULT_RANKING_CARDS: RankingCard[] = [
        {
            id: "rank-alliance-net",
            kind: "ranking",
            entity: "alliance",
            metric: "net:damage",
            scope: "all",
            limit: 8,
        },
        {
            id: "rank-nation-net",
            kind: "ranking",
            entity: "nation",
            metric: "net:damage",
            scope: "all",
            limit: 10,
        },
    ];

    const PRESET_CARD_LABELS: Record<PresetCardKey, string> = {
        duration: "Duration",
        wars: "Wars tracked",
        "damage-total": "Total damage exchanged",
        "net-gap": "Damage gap",
        "c1-dealt": "Coalition 1 dealt",
        "c2-dealt": "Coalition 2 dealt",
        participation: "Participation",
    };

    const SCOPE_LABELS: Record<WidgetScope, string> = {
        all: "All",
        coalition1: "Coalition 1",
        coalition2: "Coalition 2",
        selection: "Selection snapshot",
    };

    const DEFAULT_KPI_WIDGETS: KPIWidget[] = [
        ...DEFAULT_PRESET_CARDS,
        ...DEFAULT_RANKING_CARDS,
    ];

    let kpiWidgets: KPIWidget[] = [...DEFAULT_KPI_WIDGETS];
    let presetCards: PresetCard[] = [];
    let rankingCards: RankingCard[] = [];
    let metricCards: MetricCard[] = [];
    let draggingWidgetId: string | null = null;
    let kpiCollapsed = false;

    let selectedAllianceIdsForKpi = new Set<number>();
    let selectedNationIdsForKpi = new Set<number>();
    let selectedSnapshotLabel = "No selection";

    let rankingEntityToAdd: WidgetEntity = "nation";
    let rankingMetricToAdd = "net:damage";
    let rankingScopeToAdd: WidgetScope = "all";
    let rankingLimitToAdd = 10;

    let metricEntityToAdd: WidgetEntity = "nation";
    let metricMetricToAdd = "net:damage";
    let metricScopeToAdd: WidgetScope = "all";
    let metricAggToAdd: "sum" | "avg" = "sum";
    let metricNormalizeByToAdd = "";

    $: presetCards = kpiWidgets.filter(
        (w): w is PresetCard => w.kind === "preset",
    );
    $: rankingCards = kpiWidgets.filter(
        (w): w is RankingCard => w.kind === "ranking",
    );
    $: metricCards = kpiWidgets.filter(
        (w): w is MetricCard => w.kind === "metric",
    );

    const kpiCollapseStorageKey = () => `${getPageStorageKey()}:kpi-collapsed`;

    function formatKpiNumber(value: number | null | undefined): string {
        if (value == null || isNaN(value)) return "N/A";
        return value.toLocaleString();
    }

    function makeId(prefix: string): string {
        return makeKpiId(prefix);
    }

    function saveKpiConfig() {
        if (!conflictId) return;
        const config = readSharedKpiConfig(conflictId);
        config.widgets = kpiWidgets;
        saveSharedKpiConfig(conflictId, config);
    }

    function applyKpiConfig(config: any) {
        if (!config || typeof config !== "object") return;
        let parsedWidgets: KPIWidget[] = [];
        if (Array.isArray(config.widgets)) {
            parsedWidgets = config.widgets
                .map((item: any) => sanitizeKpiWidget(item, makeId))
                .filter(
                    (item: KPIWidget | null): item is KPIWidget =>
                        item !== null,
                );
        } else {
            parsedWidgets = buildLegacyKpiWidgets(config, makeId);
        }
        if (parsedWidgets.length > 0) {
            kpiWidgets = parsedWidgets;
        }
    }

    function loadKpiConfigFromStorage() {
        try {
            if (!conflictId) return;
            const sharedConfig = readSharedKpiConfig(conflictId);
            if (
                Array.isArray(sharedConfig.widgets) &&
                sharedConfig.widgets.length > 0
            ) {
                applyKpiConfig({ widgets: sharedConfig.widgets });
                return;
            }

            const legacyRaw = localStorage.getItem(
                `${getPageStorageKey()}:kpi-config`,
            );
            if (legacyRaw) {
                const parsedLegacy = JSON.parse(legacyRaw);
                applyKpiConfig(parsedLegacy);
                saveKpiConfig();
            }
        } catch (error) {
            console.warn("Failed to read KPI config", error);
        }
    }

    function removeWidget(id: string) {
        kpiWidgets = kpiWidgets.filter((w) => w.id !== id);
        saveKpiConfig();
    }

    function moveWidget(id: string, delta: number) {
        kpiWidgets = moveWidgetByDelta(kpiWidgets, id, delta);
        saveKpiConfig();
    }

    function moveWidgetToIndex(id: string, targetIndex: number) {
        kpiWidgets = moveWidgetToIndexInList(kpiWidgets, id, targetIndex);
        saveKpiConfig();
    }

    function startWidgetDrag(widgetId: string) {
        draggingWidgetId = widgetId;
    }

    function endWidgetDrag() {
        draggingWidgetId = null;
    }

    function dropWidgetOn(targetWidgetId: string) {
        if (!draggingWidgetId || draggingWidgetId === targetWidgetId) {
            draggingWidgetId = null;
            return;
        }
        const targetIndex = kpiWidgets.findIndex(
            (w) => w.id === targetWidgetId,
        );
        if (targetIndex === -1) {
            draggingWidgetId = null;
            return;
        }
        moveWidgetToIndex(draggingWidgetId, targetIndex);
        draggingWidgetId = null;
    }

    function buildSelectionSnapshot(): ScopeSnapshot {
        const allianceIds = Array.from(selectedAllianceIdsForKpi);
        const nationIds = Array.from(selectedNationIdsForKpi);
        const labelParts: string[] = [];
        if (allianceIds.length > 0)
            labelParts.push(
                `${allianceIds.length} alliance${allianceIds.length === 1 ? "" : "s"}`,
            );
        if (nationIds.length > 0)
            labelParts.push(
                `${nationIds.length} nation${nationIds.length === 1 ? "" : "s"}`,
            );
        return {
            allianceIds,
            nationIds,
            label:
                labelParts.length > 0 ? labelParts.join(" · ") : "No selection",
        };
    }

    function scopeLabel(scope: WidgetScope, snapshot?: ScopeSnapshot): string {
        if (scope !== "selection") return SCOPE_LABELS[scope];
        return snapshot?.label
            ? `Selection (${snapshot.label})`
            : SCOPE_LABELS.selection;
    }

    function hasSelectionForScope(scope: WidgetScope): boolean {
        if (scope !== "selection") return true;
        return (
            selectedAllianceIdsForKpi.size > 0 ||
            selectedNationIdsForKpi.size > 0
        );
    }

    function hasPresetCard(key: PresetCardKey): boolean {
        return kpiWidgets.some((w) => w.kind === "preset" && w.key === key);
    }

    function updateSelectedEntitiesFromRows(layoutType: number, rows: any[][]) {
        const allianceIds = new Set<number>();
        const nationIds = new Set<number>();

        if (layoutType === Layout.ALLIANCE) {
            for (const row of rows) {
                const allianceId = Number(row?.[0]?.[1]);
                if (Number.isFinite(allianceId)) allianceIds.add(allianceId);
            }
        } else if (layoutType === Layout.NATION) {
            for (const row of rows) {
                const nationId = Number(row?.[0]?.[1]);
                const allianceId = Number(row?.[0]?.[2]);
                if (Number.isFinite(nationId)) nationIds.add(nationId);
                if (Number.isFinite(allianceId)) allianceIds.add(allianceId);
            }
        } else if (_rawData && layoutType === Layout.COALITION) {
            for (const row of rows) {
                const coalitionIndex = Number(row?.[0]);
                if (!Number.isFinite(coalitionIndex)) continue;
                const coalition = _rawData.coalitions[coalitionIndex];
                if (!coalition) continue;
                for (const allianceId of coalition.alliance_ids) {
                    allianceIds.add(allianceId);
                }
                for (const nationId of coalition.nation_ids) {
                    nationIds.add(nationId);
                }
            }
        }

        selectedAllianceIdsForKpi = allianceIds;
        selectedNationIdsForKpi = nationIds;
        const snapshot = buildSelectionSnapshot();
        selectedSnapshotLabel = snapshot.label;
    }

    function addWidget(widget: KPIWidget) {
        kpiWidgets = [...kpiWidgets, widget];
        saveKpiConfig();
    }

    function addPresetCard(key: PresetCardKey) {
        if (hasPresetCard(key)) return;
        addWidget({ id: makeId("preset"), kind: "preset", key });
    }

    function addRankingCard() {
        const snapshot =
            rankingScopeToAdd === "selection"
                ? buildSelectionSnapshot()
                : undefined;
        if (
            rankingScopeToAdd === "selection" &&
            !hasSelectionForScope(rankingScopeToAdd)
        ) {
            return;
        }
        addWidget({
            id: makeId("ranking"),
            kind: "ranking",
            entity: rankingEntityToAdd,
            metric: rankingMetricToAdd,
            scope: rankingScopeToAdd,
            limit: Math.max(1, rankingLimitToAdd),
            snapshot,
        });
    }

    function addMetricCard() {
        const snapshot =
            metricScopeToAdd === "selection"
                ? buildSelectionSnapshot()
                : undefined;
        if (
            metricScopeToAdd === "selection" &&
            !hasSelectionForScope(metricScopeToAdd)
        ) {
            return;
        }
        addWidget({
            id: makeId("metric"),
            kind: "metric",
            entity: metricEntityToAdd,
            metric: metricMetricToAdd,
            scope: metricScopeToAdd,
            aggregation: metricAggToAdd,
            source: "conflict",
            normalizeBy: metricNormalizeByToAdd || null,
            snapshot,
        });
    }

    function toggleKpiCollapsed() {
        kpiCollapsed = !kpiCollapsed;
        localStorage.setItem(kpiCollapseStorageKey(), kpiCollapsed ? "1" : "0");
    }

    function showKpi() {
        if (!kpiCollapsed) return;
        kpiCollapsed = false;
        localStorage.setItem(kpiCollapseStorageKey(), "0");
    }

    function loadLegacyKpisFromQuery(query: URLSearchParams) {
        const kpi = query.get("kpi");
        if (!kpi) return;
        const parsed = kpi
            .split(".")
            .map((s) => s.trim())
            .filter((key) => key in PRESET_CARD_LABELS) as PresetCardKey[];
        if (parsed.length > 0) {
            kpiWidgets = parsed.map((key) => ({
                id: makeId("preset"),
                kind: "preset",
                key,
            }));
        }
    }

    $: durationSoFar = (() => {
        if (!_rawData) return "N/A";
        const start = _rawData.start;
        const end = _rawData.end === -1 ? Date.now() : _rawData.end;
        if (!start) return "N/A";
        return formatDuration(Math.max(0, Math.round((end - start) / 1000)));
    })();

    $: coalitionSummary = (() => {
        if (!_rawData) return null;
        const raw = _rawData;
        const table = computeLayoutTableData(
            raw,
            Layout.COALITION,
            layouts.Summary.columns,
            "name",
            "asc",
        );
        const dealtIdx = table.columns.indexOf("dealt:damage");
        const lossIdx = table.columns.indexOf("loss:damage");
        const netIdx = table.columns.indexOf("net:damage");
        const offWarsIdx = table.columns.indexOf("off:wars");
        const defWarsIdx = table.columns.indexOf("def:wars");
        if (
            dealtIdx === -1 ||
            lossIdx === -1 ||
            netIdx === -1 ||
            offWarsIdx === -1 ||
            defWarsIdx === -1
        ) {
            return null;
        }
        return table.data.slice(0, 2).map((row, idx) => ({
            idx,
            name: raw.coalitions[idx]?.name ?? `Coalition ${idx + 1}`,
            dealt: Number(row[dealtIdx]) || 0,
            received: Number(row[lossIdx]) || 0,
            net: Number(row[netIdx]) || 0,
            wars:
                (Number(row[offWarsIdx]) || 0) + (Number(row[defWarsIdx]) || 0),
        }));
    })();

    $: totalDamage = coalitionSummary
        ? coalitionSummary.reduce((sum, c) => sum + c.dealt, 0)
        : null;

    $: warsTracked = coalitionSummary
        ? Math.max(...coalitionSummary.map((c) => c.wars))
        : null;

    $: damageGap = coalitionSummary
        ? Math.max(...coalitionSummary.map((c) => Math.abs(c.net)))
        : null;

    $: participationStats = (() => {
        if (!_rawData) return null;
        const table = computeLayoutTableData(
            _rawData,
            Layout.NATION,
            layouts.Summary.columns,
            "name",
            "asc",
        );
        const offIdx = table.columns.indexOf("off:wars");
        const defIdx = table.columns.indexOf("def:wars");
        if (offIdx === -1 || defIdx === -1) return null;
        const total = table.data.length;
        if (total === 0) return null;
        const active = table.data.filter((row) => {
            const off = Number(row[offIdx]) || 0;
            const def = Number(row[defIdx]) || 0;
            return off + def > 0;
        }).length;
        return {
            active,
            total,
            pct: (active / total) * 100,
        };
    })();

    $: leadingCoalition = coalitionSummary
        ? coalitionSummary.reduce(
              (best, c) => (c.net > best.net ? c : best),
              coalitionSummary[0],
          )
        : null;

    $: kpiAllianceTable = _rawData
        ? computeLayoutTableData(
              _rawData,
              Layout.ALLIANCE,
              _layoutData.columns,
              _layoutData.sort,
              _layoutData.order,
          )
        : null;

    $: nationMetricTable = _rawData
        ? computeLayoutTableData(
              _rawData,
              Layout.NATION,
              _layoutData.columns,
              _layoutData.sort,
              _layoutData.order,
          )
        : null;

    $: metricsOptions = nationMetricTable
        ? nationMetricTable.columns.filter((_, i) => {
              if (i === 0) return false;
              const fm = nationMetricTable.cell_format?.formatMoney ?? [];
              const fn = nationMetricTable.cell_format?.formatNumber ?? [];
              return fm.includes(i) || fn.includes(i);
          })
        : [];

    $: if (metricsOptions.length > 0) {
        if (!metricsOptions.includes(rankingMetricToAdd)) {
            rankingMetricToAdd = metricsOptions[0];
        }
        if (!metricsOptions.includes(metricMetricToAdd)) {
            metricMetricToAdd = metricsOptions[0];
        }
    }

    function getEntityTable(entity: WidgetEntity): TableData | null {
        return entity === "alliance"
            ? (kpiAllianceTable as TableData | null)
            : (nationMetricTable as TableData | null);
    }

    function buildAavaRowsForSnapshot(snapshot: AavaScopeSnapshot) {
        if (!_rawData) return [] as any[];

        const allAllianceIds = [
            ..._rawData.coalitions[0].alliance_ids,
            ..._rawData.coalitions[1].alliance_ids,
        ];
        const headerIndex = _rawData.war_web.headers.indexOf(snapshot.header);
        if (headerIndex < 0) return [];
        const matrix = _rawData.war_web.data[headerIndex] as number[][];

        const pIndices = snapshot.primaryIds
            .map((id) => allAllianceIds.indexOf(id))
            .filter((i) => i >= 0);
        const vIndices = snapshot.vsIds
            .map((id) => allAllianceIds.indexOf(id))
            .filter((i) => i >= 0);

        const rows: any[] = [];
        let sumPrimaryToRow = 0;
        let sumRowToPrimary = 0;

        for (const rIndex of vIndices) {
            let p2r = 0;
            let r2p = 0;
            for (const pIndex of pIndices) {
                const a = matrix[pIndex]?.[rIndex] ?? 0;
                const b = matrix[rIndex]?.[pIndex] ?? 0;
                p2r += Number.isFinite(a) ? a : 0;
                r2p += Number.isFinite(b) ? b : 0;
            }
            sumPrimaryToRow += p2r;
            sumRowToPrimary += r2p;

            const allianceId = allAllianceIds[rIndex];
            rows.push({
                label:
                    namesByAllianceId[allianceId] ||
                    formatAllianceName(`AA:${allianceId}`, allianceId),
                allianceId,
                primary_to_row: p2r,
                row_to_primary: r2p,
                net: p2r - r2p,
                total: p2r + r2p,
                primary_share_pct: 0,
                row_share_pct: 0,
                abs_net: Math.abs(p2r - r2p),
            });
        }

        rows.forEach((row) => {
            row.primary_share_pct =
                sumPrimaryToRow > 0
                    ? (row.primary_to_row / sumPrimaryToRow) * 100
                    : 0;
            row.row_share_pct =
                sumRowToPrimary > 0
                    ? (row.row_to_primary / sumRowToPrimary) * 100
                    : 0;
        });

        return rows;
    }

    function getAavaMetricValue(row: any, metric: string): number {
        return Number(row?.[metric]) || 0;
    }

    function getScopedRows(
        entity: WidgetEntity,
        scope: WidgetScope,
        table: TableData,
        snapshot?: ScopeSnapshot,
    ): any[] {
        if (scope === "all") return table.data;

        if (scope === "selection") {
            const allianceIds = new Set<number>(snapshot?.allianceIds ?? []);
            const nationIds = new Set<number>(snapshot?.nationIds ?? []);
            if (entity === "alliance") {
                if (allianceIds.size === 0) return [];
                return table.data.filter((row) => {
                    const allianceId = Number(row[0]?.[1]);
                    return allianceIds.has(allianceId);
                });
            }
            if (nationIds.size > 0) {
                return table.data.filter((row) => {
                    const nationId = Number(row[0]?.[1]);
                    return nationIds.has(nationId);
                });
            }
            if (allianceIds.size > 0) {
                return table.data.filter((row) => {
                    const nationAllianceId = Number(row[0]?.[2]);
                    return allianceIds.has(nationAllianceId);
                });
            }
            return [];
        }

        if (!_rawData) return table.data;

        const coalitionAllianceIds =
            scope === "coalition1"
                ? new Set<number>(_rawData.coalitions[0]?.alliance_ids ?? [])
                : new Set<number>(_rawData.coalitions[1]?.alliance_ids ?? []);

        return table.data.filter((row) => {
            if (entity === "alliance") {
                const allianceId = Number(row[0]?.[1]);
                return coalitionAllianceIds.has(allianceId);
            }
            const nationAllianceId = Number(row[0]?.[2]);
            return coalitionAllianceIds.has(nationAllianceId);
        });
    }

    function getRankingRows(card: RankingCard) {
        if (card.source === "aava") {
            if (!card.aavaSnapshot || card.entity !== "alliance") return [];
            return buildAavaRowsForSnapshot(card.aavaSnapshot)
                .map((row) => ({
                    label: row.label,
                    alliance: "",
                    value: getAavaMetricValue(row, card.metric),
                }))
                .sort((a, b) => b.value - a.value)
                .slice(0, Math.max(1, card.limit));
        }

        const table = getEntityTable(card.entity);
        if (!table) return [];
        const metricIndex = table.columns.indexOf(card.metric);
        if (metricIndex === -1) return [];

        const rows = getScopedRows(
            card.entity,
            card.scope,
            table,
            card.snapshot,
        );
        return rows
            .map((row) => {
                if (card.entity === "alliance") {
                    return {
                        label: row[0]?.[0] ?? "N/A",
                        alliance: "",
                        value: Number(row[metricIndex]) || 0,
                    };
                }
                const allianceId = Number(row[0]?.[2]);
                return {
                    label: row[0]?.[0] ?? "N/A",
                    alliance: formatAllianceName(
                        namesByAllianceId[allianceId] ?? "",
                        allianceId,
                    ),
                    value: Number(row[metricIndex]) || 0,
                };
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, Math.max(1, card.limit));
    }

    function getMetricCardValue(card: MetricCard): number | null {
        if (card.source === "aava") {
            if (!card.aavaSnapshot || card.entity !== "alliance") return null;
            const rows = buildAavaRowsForSnapshot(card.aavaSnapshot);
            const vals = rows.map((row) =>
                getAavaMetricValue(row, card.metric),
            );
            if (vals.length === 0) return null;

            if (card.normalizeBy) {
                const denoms = rows.map((row) =>
                    getAavaMetricValue(row, card.normalizeBy as string),
                );
                if (card.aggregation === "sum") {
                    const numerator = vals.reduce((a, b) => a + b, 0);
                    const denominator = denoms.reduce((a, b) => a + b, 0);
                    return denominator === 0 ? null : numerator / denominator;
                }
                const ratios = vals
                    .map((value, idx) => {
                        const denominator = denoms[idx];
                        return denominator === 0 ? null : value / denominator;
                    })
                    .filter((value): value is number => value != null);
                if (ratios.length === 0) return null;
                return ratios.reduce((a, b) => a + b, 0) / ratios.length;
            }

            const sum = vals.reduce((a, b) => a + b, 0);
            return card.aggregation === "avg" ? sum / vals.length : sum;
        }

        const table = getEntityTable(card.entity);
        if (!table) return null;
        const metricIndex = table.columns.indexOf(card.metric);
        if (metricIndex === -1) return null;
        const rows = getScopedRows(
            card.entity,
            card.scope,
            table,
            card.snapshot,
        );
        const vals = rows.map((row) => Number(row[metricIndex]) || 0);
        if (vals.length === 0) return null;

        if (card.normalizeBy) {
            const normalizeIndex = table.columns.indexOf(card.normalizeBy);
            if (normalizeIndex === -1) return null;
            const denoms = rows.map((row) => Number(row[normalizeIndex]) || 0);
            if (card.aggregation === "sum") {
                const numerator = vals.reduce((a, b) => a + b, 0);
                const denominator = denoms.reduce((a, b) => a + b, 0);
                return denominator === 0 ? null : numerator / denominator;
            }
            const ratios = vals
                .map((value, idx) => {
                    const denominator = denoms[idx];
                    return denominator === 0 ? null : value / denominator;
                })
                .filter((value): value is number => value != null);
            if (ratios.length === 0) return null;
            return ratios.reduce((a, b) => a + b, 0) / ratios.length;
        }

        const sum = vals.reduce((a, b) => a + b, 0);
        return card.aggregation === "avg" ? sum / vals.length : sum;
    }

    function metricLabel(metric: string): string {
        return trimHeader(metric);
    }

    function widgetMetricLabel(widget: RankingCard | MetricCard): string {
        if (widget.source === "aava") {
            const header = widget.aavaSnapshot?.header ?? "wars";
            return getAavaMetricLabel(widget.metric, header);
        }
        return metricLabel(widget.metric);
    }

    function widgetNormalizeLabel(widget: MetricCard): string | null {
        if (!widget.normalizeBy) return null;
        if (widget.source === "aava") {
            const header = widget.aavaSnapshot?.header ?? "wars";
            return getAavaMetricLabel(widget.normalizeBy, header);
        }
        return metricLabel(widget.normalizeBy);
    }

    function widgetScopeLabel(widget: KPIWidget): string {
        if (
            (widget.kind === "ranking" || widget.kind === "metric") &&
            widget.source === "aava"
        ) {
            const snapshotLabel = widget.aavaSnapshot?.label || "AAvA snapshot";
            const header = widget.aavaSnapshot?.header || "wars";
            return `AAvA (${snapshotLabel} · ${header})`;
        }
        if (widget.kind === "preset") return "Preset";
        return scopeLabel(widget.scope, widget.snapshot);
    }

    function widgetManagerLabel(widget: KPIWidget): string {
        if (widget.kind === "preset") {
            return PRESET_CARD_LABELS[widget.key];
        }
        if (widget.kind === "ranking") {
            return `${widget.entity} · ${widgetMetricLabel(widget)} · ${widgetScopeLabel(widget)} · top ${widget.limit}`;
        }
        const normalized = widgetNormalizeLabel(widget)
            ? ` per ${widgetNormalizeLabel(widget)}`
            : "";
        return `${widget.aggregation.toUpperCase()} ${widget.entity} · ${widgetMetricLabel(widget)}${normalized} · ${widgetScopeLabel(widget)}`;
    }

    function loadLayout(
        rawData: Conflict,
        type: number,
        layout: string[],
        sortBy: string,
        sortDir: string,
    ) {
        conflictName = rawData.name;

        const td = computeLayoutTableData(
            rawData,
            type,
            layout,
            sortBy,
            sortDir,
        );

        let coalitions = rawData.coalitions;
        let col1: Set<number> = new Set<number>(coalitions[0].alliance_ids);
        let col2: Set<number> = new Set<number>(coalitions[1].alliance_ids);

        if (type === Layout.COALITION) {
            td.row_format = (row: HTMLElement, data: any) => {
                let name = data[0] as number;
                if (name == 0) row.classList.add("bg-danger-subtle");
                else if (name == 1) row.classList.add("bg-info-subtle");
            };
        } else if (type === Layout.ALLIANCE) {
            td.row_format = (row: HTMLElement, data: any) => {
                let id = (data[0] as number[])[1];
                if (col1.has(id)) row.classList.add("bg-danger-subtle");
                else if (col2.has(id)) row.classList.add("bg-info-subtle");
            };
        } else if (type === Layout.NATION) {
            td.row_format = (row: HTMLElement, data: any) => {
                let id = (data[0] as number[])[2] as number;
                if (col1.has(id)) row.classList.add("bg-danger-subtle");
                else if (col2.has(id)) row.classList.add("bg-info-subtle");
            };
        }

        td.onSelectionChange = (selection) => {
            updateSelectedEntitiesFromRows(type, selection.selectedRows);
        };

        updateSelectedEntitiesFromRows(type, []);

        _currentRowData = td;
        const tableContainer = document.getElementById("conflict-table-1");
        setupContainer(tableContainer as HTMLElement, _currentRowData);
    }

    function loadLayoutFromQuery(query: URLSearchParams) {
        let layout = query.get("layout");
        if (layout) {
            if (layout === "coalition") _layoutData.layout = Layout.COALITION;
            else if (layout === "alliance" || layout === "1")
                _layoutData.layout = Layout.ALLIANCE;
            else if (layout === "nation" || layout === "2")
                _layoutData.layout = Layout.NATION;
        }
        let sort = query.get("sort");
        if (sort) _layoutData.sort = sort;
        let order = query.get("order");
        if (order) _layoutData.order = order;
        let columns = query.get("columns");
        if (columns) _layoutData.columns = columns.split(".");
        loadLegacyKpisFromQuery(query);
    }

    function loadCurrentLayout() {
        if (!_rawData) return;
        loadLayout(
            _rawData,
            _layoutData.layout,
            _layoutData.columns,
            _layoutData.sort,
            _layoutData.order,
        );
    }

    function setupConflictTables(conflictId: string) {
        _loadError = null;
        _loaded = false;
        let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${conflictId}.gzip?${config.version.conflict_data}`;
        decompressBson(url)
            .then((data: Conflict) => {
                _rawData = data;
                datasetProvenance = formatDatasetProvenance(
                    config.version.conflict_data,
                    (data as any).update_ms,
                );
                setColNames(
                    data.coalitions[0].alliance_ids,
                    data.coalitions[0].alliance_names,
                );
                setColNames(
                    data.coalitions[1].alliance_ids,
                    data.coalitions[1].alliance_names,
                );
                loadCurrentLayout();
                if (data.posts && Object.keys(data.posts).length)
                    loadPosts(data.posts);
                _loaded = true;
                saveCurrentQueryParams();
            })
            .catch((error) => {
                console.error("Failed to load conflict data", error);
                _loadError =
                    "Could not load conflict data. Please try again later.";
                _loaded = true;
            });
    }

    let namesByAllianceId: { [key: number]: string } = {};
    function setColNames(ids: number[], names: string[]) {
        for (let i = 0; i < ids.length; i++) {
            namesByAllianceId[ids[i]] = formatAllianceName(names[i], ids[i]);
        }
    }

    onMount(() => {
        applySavedQueryParamsIfMissing(
            ["layout", "sort", "order", "columns", "kpi"],
            ["id"],
        );
        addFormatters();

        setWindowGlobal("getIds", (
            _coalitionName: string,
            index: number,
        ): { alliance_ids: number[]; alliance_names: string[] } => {
            return _rawData?.coalitions[index] as {
                alliance_ids: number[];
                alliance_names: string[];
            };
        });

        setWindowGlobal("formatNation", (data: any) => {
            let aaId = data[2] as number;
            let aaName = formatAllianceName(namesByAllianceId[aaId], aaId);
            return (
                '<a href="https://politicsandwar.com/alliance/id=' +
                data[2] +
                '">' +
                aaName +
                '</a> | <a href="https://politicsandwar.com/nation/id=' +
                data[1] +
                '">' +
                (data[0] ? data[0] : data[1]) +
                "</a>"
            );
        });

        setWindowGlobal("formatAA", (data: any) => {
            let allianceId = data[1] as number;
            let allianceName = formatAllianceName(data[0], allianceId);
            return (
                '<a href="https://politicsandwar.com/alliance/id=' +
                allianceId +
                '">' +
                allianceName +
                "</a>"
            );
        });

        setWindowGlobal("formatCol", (data: any) => {
            let index = data;
            let button = document.createElement("button");
            if (!_rawData) return "";
            button.setAttribute("type", "button");
            button.setAttribute("class", "ms-1 btn ux-btn btn-sm fw-bold");
            button.setAttribute(
                "onclick",
                `showNames('${_rawData.coalitions[index].name}',${index})`,
            );
            button.textContent = _rawData.coalitions[index].name;
            return button.outerHTML;
        });

        setWindowGlobal("download", function download(
            useClipboard: boolean,
            type: string,
        ) {
            downloadTableElem(
                (
                    document.getElementById("conflict-table-1") as HTMLElement
                ).querySelector("table") as HTMLTableElement,
                useClipboard,
                ExportTypes[type as keyof typeof ExportTypes],
            );
        });

        let queryParams = new URLSearchParams(window.location.search);
        loadLayoutFromQuery(queryParams);
        kpiCollapsed = localStorage.getItem(kpiCollapseStorageKey()) === "1";

        const id = queryParams.get("id");
        if (id) {
            conflictId = id;
            loadKpiConfigFromStorage();
            setupConflictTables(conflictId);
        } else {
            _loadError = "Missing conflict id in URL";
            _loaded = true;
        }
    });

    function handleClick(layout: number): void {
        _layoutData.layout = layout;
        setQueryParam("layout", _layoutData.layout);
        setQueryParam("sort", null);
        setQueryParam("columns", null);
        saveCurrentQueryParams();
        loadCurrentLayout();
    }

    function resetFilters() {
        _layoutData.layout = Layout.COALITION;
        _layoutData.columns = layouts.Summary.columns;
        _layoutData.sort = layouts.Summary.sort;
        _layoutData.order = "desc";

        kpiWidgets = [...DEFAULT_KPI_WIDGETS];
        saveKpiConfig();

        resetQueryParams(["layout", "sort", "order", "columns", "kpi"], ["id"]);
        setQueryParam("layout", _layoutData.layout, { replace: true });
        setQueryParam("sort", _layoutData.sort, { replace: true });
        setQueryParam("order", _layoutData.order, { replace: true });
        setQueryParam("columns", _layoutData.columns.join("."), {
            replace: true,
        });
        setQueryParam("kpi", null, { replace: true });
        saveCurrentQueryParams();
        loadCurrentLayout();
    }

    function retryLoad() {
        if (!conflictId) return;
        setupConflictTables(conflictId);
    }

    let dataLoaded = false;
    let postsData: { [key: string]: [number, string, number] } | null = null;

    function initializeTimeline() {
        const script = document.getElementById("visjs");
        if (
            dataLoaded &&
            postsData &&
            ((script && script.getAttribute("data-loaded")) ||
                typeof getVis() !== "undefined")
        ) {
            if (!_rawData) return;
            const container = document.getElementById("visualization");
            if (!container) return;
            if (container.hasChildNodes()) container.innerHTML = "";

            const vis = getVis();
            const items = new vis.DataSet();

            for (const key in postsData) {
                const post = postsData[key];
                const id = post[0];
                const url = `https://forum.politicsandwar.com/index.php?/topic/${id}-${post[1]}`;
                const timestamp = post[2];
                const date = new Date(timestamp);

                items.add({
                    id: id,
                    content: `<a href="${url}" target="_blank">${key}</a>`,
                    start: date,
                });
            }

            const start = _rawData.start;
            let end = _rawData.end;
            if (end === -1) end = Date.now();

            const options = {
                start: start,
                end: end,
                height: "75vh",
                width: "100%",
                zoomKey: "ctrlKey",
                orientation: "top",
                verticalScroll: true,
            };

            const timeline = new vis.Timeline(container, items, options);
            timeline.addCustomTime(start, "t1");
            timeline.addCustomTime(end, "t2");
        }
    }

    function loadPosts(posts: { [key: string]: [number, string, number] }) {
        postsData = posts;
        dataLoaded = true;
        initializeTimeline();
    }

    function onScriptLoad(event: Event) {
        const script = event.target as HTMLScriptElement;
        script.setAttribute("data-loaded", "true");
        initializeTimeline();
    }
</script>

<svelte:head>
    <title>Conflict {conflictName}</title>
    <script
        id="visjs"
        async
        src="https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js"
        on:load={onScriptLoad}
    ></script>
</svelte:head>

<div class="container-fluid p-2 ux-page-body">
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <a href="conflicts" aria-label="Back to conflicts"
            ><i class="bi bi-arrow-left"></i></a
        >&nbsp;Conflict: {conflictName}
        {#if _rawData?.wiki}
            <a
                class="btn ux-btn fw-bold"
                href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}"
                >Wiki:{_rawData?.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"
                ></i></a
            >
        {/if}
    </h1>

    <ConflictRouteTabs
        {conflictId}
        mode="layout-picker"
        currentLayout={_layoutData.layout}
        active="coalition"
        onLayoutSelect={handleClick}
    />

    <ul
        class="layout-picker-bar ux-floating-controls nav fw-bold nav-pills m-0 p-2 ux-surface mb-3 d-flex flex-wrap gap-1"
    >
        <li class="me-1">Layout Picker:</li>
        {#each Object.keys(layouts) as key}
            <li>
                <button
                    class="btn ux-btn btn-sm ms-1 fw-bold {_layoutData.columns ===
                    layouts[key].columns
                        ? 'active'
                        : ''}"
                    on:click={() => {
                        _layoutData.columns = layouts[key].columns;
                        _layoutData.sort = layouts[key].sort;
                        setQueryParam("sort", _layoutData.sort);
                        setQueryParam("columns", _layoutData.columns.join("."));
                        saveCurrentQueryParams();
                        loadCurrentLayout();
                    }}>{key}</button
                >
            </li>
        {/each}

        <li>
            <ColumnPresetManager
                currentColumns={_layoutData.columns}
                currentSort={_layoutData.sort}
                currentOrder={_layoutData.order}
                currentKpis={presetCards.map((c) => c.key)}
                currentKpiConfig={{
                    widgets: kpiWidgets,
                    presetCards,
                    rankingCards,
                    metricCards,
                }}
                on:load={(e) => {
                    const p = e.detail.preset;
                    _layoutData.columns = p.columns;
                    if (p.sort) _layoutData.sort = p.sort;
                    if (p.order) _layoutData.order = p.order;
                    if (p.kpiConfig) {
                        applyKpiConfig(p.kpiConfig);
                        saveKpiConfig();
                    } else if (Array.isArray(p.kpis) && p.kpis.length > 0) {
                        const keys = p.kpis
                            .filter((key: string) => key in PRESET_CARD_LABELS)
                            .map((key: string) => key as PresetCardKey);
                        if (keys.length > 0) {
                            kpiWidgets = keys.map((key: PresetCardKey) => ({
                                id: makeId("preset"),
                                kind: "preset",
                                key,
                            }));
                            saveKpiConfig();
                        }
                    }
                    setQueryParam("columns", _layoutData.columns.join("."));
                    setQueryParam("sort", _layoutData.sort);
                    setQueryParam("order", _layoutData.order);
                    saveCurrentQueryParams();
                    loadCurrentLayout();
                }}
            />
        </li>

        {#if kpiCollapsed}
            <li>
                <button class="btn ux-btn btn-sm" on:click={showKpi}
                    >Show KPI</button
                >
            </li>
        {/if}

        <li class="dropdown ms-auto" data-bs-auto-close="outside">
            <button
                class="btn ux-btn btn-sm"
                type="button"
                id="kpiManagerDropdown"
                data-bs-toggle="dropdown"
                aria-expanded="false"
            >
                KPI widgets&nbsp;<i class="bi bi-chevron-down"></i>
            </button>
            <div
                class="dropdown-menu p-2"
                aria-labelledby="kpiManagerDropdown"
                style="min-width: 340px;"
            >
                <div class="small text-muted mb-1">KPI cards</div>
                {#if kpiWidgets.length === 0}
                    <div class="small text-muted mb-2">No cards</div>
                {/if}
                {#each kpiWidgets as card, idx}
                    <div
                        class="d-flex align-items-center justify-content-between gap-2 mb-1"
                    >
                        <span class="small text-truncate"
                            >{widgetManagerLabel(card)}</span
                        >
                        <div class="d-flex gap-1">
                            <button
                                type="button"
                                class="btn btn-sm btn-outline-secondary"
                                on:click|preventDefault|stopPropagation={() =>
                                    moveWidget(card.id, -1)}
                                disabled={idx === 0}>↑</button
                            >
                            <button
                                type="button"
                                class="btn btn-sm btn-outline-secondary"
                                on:click|preventDefault|stopPropagation={() =>
                                    moveWidget(card.id, 1)}
                                disabled={idx === kpiWidgets.length - 1}
                                >↓</button
                            >
                            <button
                                type="button"
                                class="btn btn-sm btn-outline-danger"
                                on:click|preventDefault|stopPropagation={() =>
                                    removeWidget(card.id)}>Remove</button
                            >
                        </div>
                    </div>
                {/each}

                <hr class="dropdown-divider" />
                <div class="small text-muted mb-1">Preset cards</div>
                <div class="d-flex flex-wrap gap-1 mb-2">
                    {#each Object.keys(PRESET_CARD_LABELS) as key}
                        {@const presetKey = key as PresetCardKey}
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            on:click|preventDefault|stopPropagation={() =>
                                addPresetCard(presetKey)}
                            disabled={hasPresetCard(presetKey)}
                            >+ {PRESET_CARD_LABELS[presetKey]}</button
                        >
                    {/each}
                </div>

                <hr class="dropdown-divider" />
                <div class="small text-muted mb-1">Ranking cards</div>
                <div class="row g-1 mb-2">
                    <div class="col-4">
                        <select
                            class="form-select form-select-sm"
                            bind:value={rankingEntityToAdd}
                        >
                            <option value="alliance">Alliance</option>
                            <option value="nation">Nation</option>
                        </select>
                    </div>
                    <div class="col-4">
                        <select
                            class="form-select form-select-sm"
                            bind:value={rankingScopeToAdd}
                        >
                            <option value="all">All</option>
                            <option value="coalition1">Coalition 1</option>
                            <option value="coalition2">Coalition 2</option>
                            <option value="selection"
                                >Selection snapshot ({selectedSnapshotLabel})</option
                            >
                        </select>
                    </div>
                    <div class="col-4">
                        <input
                            class="form-control form-control-sm"
                            type="number"
                            min="1"
                            bind:value={rankingLimitToAdd}
                        />
                    </div>
                    <div class="col-12">
                        <select
                            class="form-select form-select-sm"
                            bind:value={rankingMetricToAdd}
                        >
                            {#each metricsOptions as metric}
                                <option value={metric}
                                    >{metricLabel(metric)}</option
                                >
                            {/each}
                        </select>
                    </div>
                    <div class="col-12">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary w-100"
                            on:click|preventDefault|stopPropagation={addRankingCard}
                            disabled={!hasSelectionForScope(rankingScopeToAdd)}
                            >+ Add ranking card</button
                        >
                    </div>
                </div>

                <hr class="dropdown-divider" />
                <div class="small text-muted mb-1">Metric cards</div>

                <div class="row g-1">
                    <div class="col-4">
                        <select
                            class="form-select form-select-sm"
                            bind:value={metricEntityToAdd}
                        >
                            <option value="alliance">Alliance</option>
                            <option value="nation">Nation</option>
                        </select>
                    </div>
                    <div class="col-4">
                        <select
                            class="form-select form-select-sm"
                            bind:value={metricScopeToAdd}
                        >
                            <option value="all">All</option>
                            <option value="coalition1">Coalition 1</option>
                            <option value="coalition2">Coalition 2</option>
                            <option value="selection"
                                >Selection snapshot ({selectedSnapshotLabel})</option
                            >
                        </select>
                    </div>
                    <div class="col-4">
                        <select
                            class="form-select form-select-sm"
                            bind:value={metricAggToAdd}
                        >
                            <option value="sum">Sum</option>
                            <option value="avg">Avg</option>
                        </select>
                    </div>
                    <div class="col-12">
                        <select
                            class="form-select form-select-sm"
                            bind:value={metricMetricToAdd}
                        >
                            {#each metricsOptions as metric}
                                <option value={metric}
                                    >{metricLabel(metric)}</option
                                >
                            {/each}
                        </select>
                    </div>
                    <div class="col-12">
                        <select
                            class="form-select form-select-sm"
                            bind:value={metricNormalizeByToAdd}
                        >
                            <option value="">No normalization</option>
                            {#each metricsOptions as metric}
                                <option value={metric}
                                    >Per {metricLabel(metric)}</option
                                >
                            {/each}
                        </select>
                    </div>
                    <div class="col-12">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary w-100"
                            on:click|preventDefault|stopPropagation={addMetricCard}
                            disabled={!hasSelectionForScope(metricScopeToAdd)}
                            >+ Add metric card</button
                        >
                    </div>
                </div>

                <hr class="dropdown-divider" />
                {#if conflictId}
                    <a
                        class="btn btn-sm btn-outline-secondary w-100 mt-1"
                        href={`aava?id=${conflictId}`}
                        >Add AAvA widgets from the AAvA page</a
                    >
                {/if}
            </div>
        </li>

        <li class="d-flex flex-wrap gap-1 justify-content-end">
            <ShareResetBar onReset={resetFilters} />
        </li>
    </ul>

    {#if _rawData && !kpiCollapsed}
        <div class="ux-surface p-2 mb-3 rounded border">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <h5 class="m-0">KPI</h5>
                <button
                    type="button"
                    class="btn-close"
                    aria-label="Hide KPI"
                    on:click={toggleKpiCollapsed}
                ></button>
            </div>

            <div class="row g-2">
                {#each kpiWidgets as card}
                    {@const isRankingCard = card.kind === "ranking"}
                    <div
                        class={isRankingCard
                            ? "col-12 col-lg-6"
                            : "col-12 col-sm-6 col-xl-4"}
                    >
                        <div
                            class="ux-surface p-3 rounded border h-100 position-relative kpi-card"
                            class:kpi-card-dragging={draggingWidgetId ===
                                card.id}
                            role="group"
                            draggable="true"
                            on:dragstart={() => startWidgetDrag(card.id)}
                            on:dragend={endWidgetDrag}
                            on:dragover|preventDefault
                            on:drop|preventDefault={() => dropWidgetOn(card.id)}
                        >
                            <button
                                type="button"
                                class="btn-close kpi-card-close"
                                aria-label="Remove KPI card"
                                on:click={() => removeWidget(card.id)}
                            ></button>
                            {#if card.kind === "preset"}
                                {#if card.key === "duration"}
                                    <div class="small text-muted">Duration</div>
                                    <div class="h6 m-0">{durationSoFar}</div>
                                {:else if card.key === "wars"}
                                    <div class="small text-muted">
                                        Wars tracked
                                    </div>
                                    <div class="h6 m-0">
                                        {formatKpiNumber(warsTracked)}
                                    </div>
                                {:else if card.key === "damage-total"}
                                    <div class="small text-muted">
                                        Total damage exchanged
                                    </div>
                                    <div class="h6 m-0">
                                        {formatKpiNumber(totalDamage)}
                                    </div>
                                {:else if card.key === "net-gap"}
                                    <div class="small text-muted">
                                        Damage gap
                                    </div>
                                    <div class="h6 m-0">
                                        {formatKpiNumber(damageGap)}
                                    </div>
                                    {#if leadingCoalition}
                                        <div class="small text-muted">
                                            Lead: {leadingCoalition.name}
                                        </div>
                                    {/if}
                                {:else if card.key === "c1-dealt"}
                                    <div class="small text-muted">
                                        {coalitionSummary?.[0]?.name ??
                                            "Coalition 1"} dealt
                                    </div>
                                    <div class="h6 m-0">
                                        {formatKpiNumber(
                                            coalitionSummary?.[0]?.dealt,
                                        )}
                                    </div>
                                {:else if card.key === "c2-dealt"}
                                    <div class="small text-muted">
                                        {coalitionSummary?.[1]?.name ??
                                            "Coalition 2"} dealt
                                    </div>
                                    <div class="h6 m-0">
                                        {formatKpiNumber(
                                            coalitionSummary?.[1]?.dealt,
                                        )}
                                    </div>
                                {:else if card.key === "participation"}
                                    <div class="small text-muted">
                                        Participation
                                    </div>
                                    <div class="h6 m-0">
                                        {participationStats
                                            ? `${participationStats.pct.toFixed(1)}%`
                                            : "N/A"}
                                    </div>
                                    {#if participationStats}
                                        <div class="small text-muted">
                                            {participationStats.active}/{participationStats.total}
                                            nations with at least one war
                                        </div>
                                    {/if}
                                {/if}
                            {:else if card.kind === "ranking"}
                                {@const rows = getRankingRows(card)}
                                <div class="small text-muted mb-1">
                                    Top {card.limit}
                                    {card.entity}s by
                                    {card.source === "aava"
                                        ? getAavaMetricLabel(
                                              card.metric,
                                              card.aavaSnapshot?.header ??
                                                  "wars",
                                          )
                                        : metricLabel(card.metric)}
                                    ({widgetScopeLabel(card)})
                                </div>
                                <div class="table-responsive">
                                    <table
                                        class="table table-sm table-striped m-0"
                                    >
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th
                                                    >{card.entity === "alliance"
                                                        ? "Alliance"
                                                        : "Nation"}</th
                                                >
                                                {#if card.entity === "nation"}
                                                    <th>Alliance</th>
                                                {/if}
                                                <th class="text-end">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#each rows as row, i}
                                                <tr>
                                                    <td>{i + 1}</td>
                                                    <td>{row.label}</td>
                                                    {#if card.entity === "nation"}
                                                        <td>{row.alliance}</td>
                                                    {/if}
                                                    <td class="text-end"
                                                        >{row.value.toLocaleString()}</td
                                                    >
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                </div>
                            {:else}
                                <div class="small text-muted">
                                    {card.aggregation.toUpperCase()}
                                    {card.entity}
                                    {card.source === "aava"
                                        ? getAavaMetricLabel(
                                              card.metric,
                                              card.aavaSnapshot?.header ??
                                                  "wars",
                                          )
                                        : metricLabel(card.metric)}
                                    {card.normalizeBy
                                        ? ` per ${
                                              card.source === "aava"
                                                  ? getAavaMetricLabel(
                                                        card.normalizeBy,
                                                        card.aavaSnapshot
                                                            ?.header ?? "wars",
                                                    )
                                                  : metricLabel(
                                                        card.normalizeBy,
                                                    )
                                          }`
                                        : ""}
                                    ({widgetScopeLabel(card)})
                                </div>
                                <div class="h6 m-0">
                                    {formatKpiNumber(getMetricCardValue(card))}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    {#if !_loaded}
        <Progress />
    {/if}

    {#if _loadError}
        <div
            class="alert alert-danger m-2 d-flex justify-content-between align-items-center"
        >
            <span>{_loadError}</span>
            <button
                class="btn btn-sm btn-outline-danger fw-bold"
                on:click={retryLoad}>Retry</button
            >
        </div>
    {/if}

    <div id="conflict-table-1"></div>

    {#if _layoutData.layout == Layout.COALITION}
        <hr />
        <div class="row m-0">
            {#if _rawData?.cb}
                <div class="col-md-6 col-sm-12">
                    <div class="col-md-12 ms-2 p-2 rounded border ux-surface">
                        <h3>Casus Belli</h3>
                        <pre>{_rawData?.cb}</pre>
                    </div>
                </div>
            {/if}
            {#if _rawData?.status}
                <div class="col-md-6 col-sm-12">
                    <div class="col-md-12 ms-2 p-2 rounded border ux-surface">
                        <h3>Status</h3>
                        <pre>{_rawData?.status}</pre>
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    <hr />
    <div class="ux-surface p-2">
        <h4>
            {formatDate(_rawData?.start ?? null)} - {formatDate(
                _rawData?.end ?? null,
            )}
        </h4>
        <div class="m-0" id="visualization"></div>
    </div>

    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}
</div>
