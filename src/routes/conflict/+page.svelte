<script lang="ts">
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import { base } from "$app/paths";
    import { onDestroy, onMount } from "svelte";
    import { buildStringSelectionItems, firstSelectedString, validateSingleSelection } from "$lib/selectionModalHelpers";
    import { decompressBson } from "$lib/binary";
    import {
        commafy,
        formatDate,
        formatDuration,
        formatAllianceName,
        formatNationName,
    } from "$lib/formatting";
    import { setupContainer } from "$lib/tableAdapter";
    import {
        getOrComputeConflictTableData,
        invalidateConflictLayouts,
        warmConflictTableLayouts,
        type ConflictTableLayoutInput,
    } from "$lib/conflictLayoutCache";
    import {
        setQueryParams,
        decodeQueryParamValue,
    } from "$lib/queryState";
    import {
        parseConflictLayoutQuery,
        serializeConflictLayoutQuery,
    } from "$lib/conflictLayoutQueryState";
    import { getPageStorageKey, saveCurrentQueryParams } from "$lib/queryStorage";
    import { ExportTypes, downloadTableElem } from "$lib/dataExport";
    import { registerFormatters } from "$lib/formatters";
    import { modalWithCloseButton } from "$lib/modals";
    import {
        formatDatasetProvenance,
        getConflictDataUrl,
    } from "$lib/runtime";
    import {
        warmBubbleDefaultArtifact,
        warmConflictGraphPayload,
        warmRuntimeArtifact,
        warmTieringDefaultArtifact,
    } from "$lib/prefetchArtifacts";
    import { trimHeader } from "$lib/warWeb";
    import {
        createConflictKpiComputations,
    } from "$lib/conflictKpiComputations";
    import {
        computeCoalitionSummary,
        computeDurationSoFar,
        computeLeadingCoalition,
        computeOffWarsPerNationStats,
    } from "$lib/conflictKpiPresetComputations";
    import { createConflictKpiPresentation } from "$lib/conflictKpiPresentation";
    import { createConflictKpiWidgetActions } from "$lib/conflictKpiWidgetActions";
    import type { ConflictKpiContext } from "$lib/conflictKpiTypes";
    import { yieldToMain } from "$lib/misc";
    import { bootstrapIdRouteLifecycle } from "$lib/routeBootstrap";
    import type { TableCallbacks } from "$lib/tableCallbacks";
    import type { Conflict, TableData } from "$lib/types";
    import type { ColumnPreset } from "$lib/columnPresets";
    import {
        makeKpiId,
        type ConflictKPIWidget,
        type MetricCard,
        type PresetCard,
        type PresetCardKey,
        type RankingCard,
        type ScopeSnapshot,
        type WidgetEntity,
        type WidgetScope,
    } from "$lib/kpi";
    import {
        DEFAULT_KPI_WIDGETS,
        PRESET_CARD_LABELS,
        PRESET_CARD_DESCRIPTIONS,
        formatKpiNumber,
        splitKpiWidgets,
        buildSelectionSnapshot as buildSelectionSnapshotFromState,
        scopeLabel as scopeLabelFromState,
        hasSelectionForScope as hasSelectionForScopeFromState,
        kpiAddReasonForScope as kpiAddReasonForScopeFromState,
        stripWidgetIds,
        serializeKpiWidgetsForUrl as serializeKpiWidgetsForUrlWithId,
        parseKpiWidgetsFromUrl as parseKpiWidgetsFromUrlWithId,
        sanitizeKpiWidgets,
        persistSharedKpiWidgets,
        loadSharedKpiWidgets,
    } from "$lib/conflictKpiState";
    import { getAavaMetricLabel } from "$lib/aava";
    import { getVisGlobal, setWindowGlobal } from "$lib/globals";
    import ColumnPresetManager from "../../components/ColumnPresetManager.svelte";
    import SelectionModal from "../../components/SelectionModal.svelte";
    import KpiBuilderModal from "../../components/KpiBuilderModal.svelte";
    import ConflictKpiSection from "../../components/ConflictKpiSection.svelte";
    import type {
        SelectionId,
        SelectionModalItem,
    } from "$lib/selection/types";
    import { appConfig as config } from "$lib/appConfig";
    import { beginJourneySpan, endJourneySpan, incrementPerfCounter, startPerfSpan } from "$lib/perf";
    import { layoutTabFromIndex } from "$lib/conflictTabs";
    import {
        CONFLICT_TABLE_LAYOUT_PRESETS,
        CONFLICT_TABLE_LAYOUT_PRESET_KEYS,
        DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET,
        DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY,
        createDefaultConflictTableLayoutState,
        detectConflictTableLayoutPresetKey,
        isConflictTableLayoutStateEqual,
    } from "$lib/conflictTablePresets";

    const Layout = {
        COALITION: 0,
        ALLIANCE: 1,
        NATION: 2,
    } as const;

    type KPIWidget = ConflictKPIWidget;

    let conflictName = "";
    let conflictId: string | null = null;
    let trimmedConflictId = "";
    let isVirtualConflictId = false;
    let virtualConflictEditUrl: string | null = null;
    let _loaded = false;
    let _loadError: string | null = null;
    let datasetProvenance = "";
    let _rawData: Conflict | null = null;

    const layouts = CONFLICT_TABLE_LAYOUT_PRESETS;

    // Invariant: _layoutData is the single source of truth for active table layout inputs.
    // Downstream consumers must derive from this object instead of recomputing ad-hoc tables.
    let _layoutData = createDefaultConflictTableLayoutState();

    type LayoutDerivationInput = ConflictTableLayoutInput;

    const CONFLICT_DEBUG_LOG = true;

    function logConflictDebug(message: string, meta?: Record<string, unknown>) {
        if (!CONFLICT_DEBUG_LOG) return;
        if (meta) {
            console.info(`[conflict-debug] ${message}`, meta);
            return;
        }
        console.info(`[conflict-debug] ${message}`);
    }

    let layoutDerivationSourceKey: string | null = null;

    function deriveLayoutTable(
        rawData: Conflict,
        input: LayoutDerivationInput,
    ): TableData {
        const sourceKey =
            layoutDerivationSourceKey ??
            `conflict:${conflictId ?? "unknown"}:v${String(config.version.conflict_data)}`;
        const startedAt = performance.now();
        const computed = getOrComputeConflictTableData(
            sourceKey,
            rawData,
            {
                layout: input.layout,
                columns: [...input.columns],
                sort: input.sort,
                order: input.order,
            },
        );
        logConflictDebug("deriveLayoutTable resolved", {
            sourceKey,
            rows: computed.data.length,
            columns: computed.columns.length,
            elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
        });
        return computed;
    }

    function currentLayoutInput(): LayoutDerivationInput {
        return {
            layout: _layoutData.layout,
            columns: _layoutData.columns,
            sort: _layoutData.sort,
            order: _layoutData.order,
        };
    }
    const layoutPresetKeys = CONFLICT_TABLE_LAYOUT_PRESET_KEYS;

    let _currentRowData: TableData;
    const getVis = (): any => getVisGlobal();

    $: currentLayoutLabel =
        _layoutData.layout === Layout.ALLIANCE
            ? "Alliance"
            : _layoutData.layout === Layout.NATION
              ? "Nation"
              : "Coalition";

    let kpiWidgets: KPIWidget[] = [...DEFAULT_KPI_WIDGETS];
    let presetCards: PresetCard[] = [];
    let rankingCards: RankingCard[] = [];
    let metricCards: MetricCard[] = [];
    let draggingWidgetId: string | null = null;
    let kpiCollapsed = false;
    let showLayoutPresetModal = false;
    let showKpiBuilderModal = false;
    let showPresetOverflowMenu = false;
    let selectedLayoutPresetKey: string | null = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY;

    let layoutPresetViewportEl: HTMLDivElement | null = null;
    let layoutPresetButtonsEl: HTMLDivElement | null = null;
    let layoutPresetResizeObserver: ResizeObserver | null = null;

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
    let metricsOptions: string[] = [];

    function isSameLayoutState(input: {
        sort: string;
        order: string;
        columns: string[];
    }): boolean {
        return isConflictTableLayoutStateEqual(_layoutData, {
            sort: input.sort,
            order: input.order === "asc" ? "asc" : "desc",
            columns: input.columns,
        });
    }

    $: {
        const split = splitKpiWidgets(kpiWidgets);
        presetCards = split.presetCards;
        rankingCards = split.rankingCards;
        metricCards = split.metricCards;
    }

    const kpiCollapseStorageKey = () => `${getPageStorageKey()}:kpi-collapsed`;

    function saveKpiConfig() {
        persistSharedKpiWidgets(conflictId, kpiWidgets);
    }

    const conflictKpiContext: ConflictKpiContext = {
        data: {
            getRawData: () => _rawData,
            getEntityTable: (entity) =>
                entity === "alliance"
                    ? (kpiAllianceTable as TableData | null)
                    : (nationMetricTable as TableData | null),
            getNamesByAllianceId: () => namesByAllianceId,
            formatAllianceName,
            formatNationName,
        },
        widgets: {
            getWidgets: () => kpiWidgets,
            setWidgets: (widgets) => {
                kpiWidgets = widgets;
            },
            persistWidgets: (widgets) => {
                persistSharedKpiWidgets(conflictId, widgets);
            },
            makeId: makeKpiId,
        },
        selection: {
            hasSelectionForScope: (scope) =>
                hasSelectionForScopeFromState(
                    scope,
                    selectedAllianceIdsForKpi,
                    selectedNationIdsForKpi,
                ),
            buildSelectionSnapshot: () =>
                buildSelectionSnapshotFromState(
                    selectedAllianceIdsForKpi,
                    selectedNationIdsForKpi,
                ),
            scopeLabel: (scope, snapshot) =>
                scopeLabelFromState(scope, snapshot),
        },
        presentation: {
            presetCardLabels: PRESET_CARD_LABELS,
            trimHeader,
            getAavaMetricLabel,
        },
    };

    const kpiWidgetActions = createConflictKpiWidgetActions({
        context: conflictKpiContext,
    });

    function applyKpiConfig(config: any) {
        if (!config || typeof config !== "object") return;
        const parsed = sanitizeKpiWidgets(config.widgets, makeKpiId);
        if (parsed.length > 0) {
            kpiWidgets = parsed;
        }
    }

    function loadKpiConfigFromStorage() {
        try {
            const widgets = loadSharedKpiWidgets(conflictId, makeKpiId);
            if (widgets && widgets.length > 0) {
                kpiWidgets = widgets;
            }
        } catch (error) {
            console.warn("Failed to read KPI config", error);
        }
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
        kpiWidgetActions.moveWidgetToIndex(draggingWidgetId, targetIndex);
        draggingWidgetId = null;
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
        const snapshot: ScopeSnapshot = buildSelectionSnapshotFromState(
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        );
        selectedSnapshotLabel = snapshot.label;
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

    $: durationSoFar = (() => {
        return computeDurationSoFar(_rawData, formatDuration);
    })();

    $: summaryCoalitionTable = _rawData
        ? deriveLayoutTable(_rawData, {
              layout: Layout.COALITION,
              columns: layouts.Summary.columns,
              sort: "name",
              order: "asc",
          })
        : null;

    $: summaryNationTable = _rawData
        ? deriveLayoutTable(_rawData, {
              layout: Layout.NATION,
              columns: layouts.Summary.columns,
              sort: "name",
              order: "asc",
          })
        : null;

    $: coalitionSummary = (() => {
        return computeCoalitionSummary(_rawData, summaryCoalitionTable);
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

    $: offWarsPerNationStats = (() => {
        return computeOffWarsPerNationStats(summaryNationTable);
    })();

    $: leadingCoalition = coalitionSummary
        ? computeLeadingCoalition(coalitionSummary)
        : null;

    // Invariant: KPI derivations are raw-data scoped; table presets/sort/order must not invalidate them.
    $: kpiAllianceTable = _rawData
        ? deriveLayoutTable(_rawData, {
              layout: Layout.ALLIANCE,
              columns: layouts.Summary.columns,
              sort: "name",
              order: "asc",
          })
        : null;

    $: nationMetricTable = _rawData
        ? deriveLayoutTable(_rawData, {
              layout: Layout.NATION,
              columns: layouts.Summary.columns,
              sort: "name",
              order: "asc",
          })
        : null;

    $: {
        const nextMetricsOptions = nationMetricTable
            ? nationMetricTable.columns.filter((_, i) => {
                  if (i === 0) return false;
                  const fm = nationMetricTable.cell_format?.formatMoney ?? [];
                  const fn = nationMetricTable.cell_format?.formatNumber ?? [];
                  return fm.includes(i) || fn.includes(i);
              })
            : [];
        metricsOptions = nextMetricsOptions;

        const fallbackMetric = nextMetricsOptions[0] ?? "net:damage";
        if (!nextMetricsOptions.includes(rankingMetricToAdd)) {
            rankingMetricToAdd = fallbackMetric;
        }
        if (!nextMetricsOptions.includes(metricMetricToAdd)) {
            metricMetricToAdd = fallbackMetric;
        }
    }

    const kpiComputations = createConflictKpiComputations({
        context: conflictKpiContext,
    });

    $: {
        // Invariant: widget/raw-data changes invalidate KPI caches; layout preset churn should not.
        _rawData;
        kpiAllianceTable;
        nationMetricTable;
        kpiWidgets;
        kpiComputations.clearCaches();
    }

    const {
        metricLabel,
        metricDescription,
        widgetScopeLabel,
        widgetManagerLabel,
    } = createConflictKpiPresentation({
        context: conflictKpiContext,
    });

    function loadLayout(
        rawData: Conflict,
        type: number,
        td: TableData,
    ) {
        conflictName = rawData.name;

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
            incrementPerfCounter("conflict.layout.selection.change");
            updateSelectedEntitiesFromRows(type, selection.selectedRows);
        };

        updateSelectedEntitiesFromRows(type, []);

        _currentRowData = td;
        const tableContainer = document.getElementById("conflict-table-1");
        const tableCallbacks: TableCallbacks = {
            cellFormatters: {
                formatNation: formatNationCell,
                formatAA: formatAllianceCell,
                formatCol: formatCoalitionCell,
            },
            actions: {
                download: downloadConflictTable,
            },
        };
        setupContainer(tableContainer as HTMLElement, _currentRowData, tableCallbacks);
    }

    function loadLayoutFromQuery(query: URLSearchParams) {
        const nextLayoutState = parseConflictLayoutQuery(query, {
            layout: Layout.COALITION,
            sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
            order: "desc",
            columns: [...DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns],
        });
        _layoutData.layout = nextLayoutState.layout;
        _layoutData.sort = nextLayoutState.sort;
        _layoutData.order = nextLayoutState.order;
        _layoutData.columns = nextLayoutState.columns;

        const decodedWidgets = decodeQueryParamValue("kpiw", query.get("kpiw"));
        if (decodedWidgets) {
            try {
                const widgets = parseKpiWidgetsFromUrlWithId(
                    decodedWidgets,
                    makeKpiId,
                );
                if (widgets.length > 0) {
                    kpiWidgets = widgets;
                }
            } catch (error) {
                console.warn("Failed to parse KPI widgets from URL", error);
            }
        }

        selectedLayoutPresetKey = detectLayoutPresetKey();
    }

    function loadCurrentLayout() {
        if (!_rawData) return;
        const startedAt = performance.now();
        logConflictDebug("loadCurrentLayout start", {
            layout: _layoutData.layout,
            sort: _layoutData.sort,
            order: _layoutData.order,
            columns: _layoutData.columns.length,
        });
        const finishSpan = startPerfSpan("conflict.layout.apply", {
            layout: _layoutData.layout,
            sort: _layoutData.sort,
            order: _layoutData.order,
            columns: _layoutData.columns.length,
        });
        const tableData = deriveLayoutTable(_rawData, currentLayoutInput());
        loadLayout(
            _rawData,
            _layoutData.layout,
            tableData,
        );
        finishSpan();
        logConflictDebug("loadCurrentLayout end", {
            rows: tableData.data.length,
            elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
        });
    }

    function queryDefaults() {
        return {
            layout: "coalition",
            sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
            order: "desc",
            columns: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns.join("."),
            kpiw: serializeKpiWidgetsForUrlWithId(DEFAULT_KPI_WIDGETS, makeKpiId),
        };
    }

    type SyncUrlStateOptions = {
        includeKpi?: boolean;
        replace?: boolean;
        persist?: boolean;
        clearLayoutSortAndColumns?: boolean;
    };

    function syncUrlState(options: SyncUrlStateOptions = {}): void {
        const values: Record<string, string | number | boolean | null | undefined> = {
            ...serializeConflictLayoutQuery(_layoutData, {
                clearSortAndColumns: options.clearLayoutSortAndColumns,
            }),
        };

        if (options.includeKpi) {
            values.kpiw = serializeKpiWidgetsForUrlWithId(kpiWidgets, makeKpiId);
        }

        setQueryParams(values, {
            replace: options.replace ?? false,
            defaults: queryDefaults(),
        });

        if (options.persist) {
            saveCurrentQueryParams();
        }
    }

    function syncShareStateToUrl() {
        syncUrlState({ includeKpi: true, replace: true, persist: true });
    }

    $: isResetDirty = (() => {
        const defaultCols = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns;
        const sameColumns =
            _layoutData.columns.length === defaultCols.length &&
            _layoutData.columns.every(
                (value, idx) => value === defaultCols[idx],
            );
        const sameLayout =
            _layoutData.layout === Layout.COALITION &&
            _layoutData.sort === DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort &&
            _layoutData.order === "desc" &&
            sameColumns;

        const currentWidgets = JSON.stringify(stripWidgetIds(kpiWidgets));
        const defaultWidgets = JSON.stringify(
            stripWidgetIds(DEFAULT_KPI_WIDGETS),
        );
        const sameKpi = currentWidgets === defaultWidgets;

        return !(sameLayout && sameKpi);
    })();

    function setupConflictTables(conflictId: string) {
        beginJourneySpan("journey.conflicts_to_conflict.dataFetch", {
            conflictId,
        });
        _loadError = null;
        _loaded = false;
        const nextSourceKey = `conflict:${conflictId}:v${String(config.version.conflict_data)}`;
        if (layoutDerivationSourceKey && layoutDerivationSourceKey !== nextSourceKey) {
            invalidateConflictLayouts({
                sourceKey: layoutDerivationSourceKey,
                reason: "conflict-id-change",
            });
        }
        layoutDerivationSourceKey = nextSourceKey;
        let url = getConflictDataUrl(conflictId, config.version.conflict_data);
        decompressBson(url)
            .then(async (data: Conflict) => {
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
                await yieldToMain();
                warmConflictTableLayouts(
                    layoutDerivationSourceKey ?? nextSourceKey,
                    data,
                    [
                    {
                        layout: Layout.COALITION,
                        columns: [...DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns],
                        sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
                        order: "desc",
                    },
                    {
                        layout: Layout.ALLIANCE,
                        columns: [...DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns],
                        sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
                        order: "desc",
                    },
                    {
                        layout: Layout.NATION,
                        columns: [...DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns],
                        sort: DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort,
                        order: "desc",
                    },
                ],
                );
                loadCurrentLayout();
                if (data.posts && Object.keys(data.posts).length)
                    loadPosts(data.posts);
                _loaded = true;
                endJourneySpan("journey.conflicts_to_conflict.routeTransition");
                endJourneySpan("journey.conflicts_to_conflict.firstMount");
                saveCurrentQueryParams();

                // Warm graph payload cache so Tiering/Bubble route switches are faster.
                warmConflictGraphPayload(conflictId, {
                    priority: "idle",
                    reason: "route-conflict-idle-graph-payload",
                    routeTarget: "/conflict",
                    intentStrength: "idle",
                });
                warmBubbleDefaultArtifact(conflictId, {
                    priority: "idle",
                    reason: "route-conflict-idle-bubble-default",
                    routeTarget: "/bubble",
                    intentStrength: "idle",
                });
                warmTieringDefaultArtifact(conflictId, {
                    priority: "idle",
                    reason: "route-conflict-idle-tiering-default",
                    routeTarget: "/tiering",
                    intentStrength: "idle",
                });
            })
            .catch((error) => {
                console.error("Failed to load conflict data", error);
                _loadError =
                    "Could not load conflict data. Please try again later.";
                _loaded = true;
            })
            .finally(() => {
                endJourneySpan("journey.conflicts_to_conflict.dataFetch");
            });
    }

    let namesByAllianceId: { [key: number]: string } = {};
    function setColNames(ids: number[], names: string[]) {
        for (let i = 0; i < ids.length; i++) {
            namesByAllianceId[ids[i]] = formatAllianceName(names[i], ids[i]);
        }
    }

    function formatNationCell(data: any): string {
        let aaId = data[2] as number;
        let aaName = formatAllianceName(namesByAllianceId[aaId], aaId);
        let nationName = formatNationName(data[0], data[1]);
        return (
            '<a href="https://politicsandwar.com/alliance/id=' +
            data[2] +
            '">' +
            aaName +
            '</a> | <a href="https://politicsandwar.com/nation/id=' +
            data[1] +
            '">' +
            nationName +
            "</a>"
        );
    }

    function formatAllianceCell(data: any): string {
        let allianceId = data[1] as number;
        let allianceName = formatAllianceName(data[0], allianceId);
        return (
            '<a href="https://politicsandwar.com/alliance/id=' +
            allianceId +
            '">' +
            allianceName +
            "</a>"
        );
    }

    function formatCoalitionCell(data: any): string {
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
    }

    function downloadConflictTable(useClipboard: boolean, type: string): void {
        const tableElem = (
            document.getElementById("conflict-table-1") as HTMLElement
        ).querySelector("table") as HTMLTableElement;
        downloadTableElem(
            tableElem,
            useClipboard,
            ExportTypes[type as keyof typeof ExportTypes],
            `conflict-${conflictId ?? "conflict"}-overview`,
        );
    }

    onMount(() => {
        registerFormatters({
            commafy,
            formatDate,
            formatAllianceName,
            modalWithCloseButton,
        });
        warmRuntimeArtifact("table", {
            priority: "high",
            reason: "route-conflict-load-runtime",
            routeTarget: "/conflict",
            intentStrength: "load",
        });

        setWindowGlobal(
            "getIds",
            (
                _coalitionName: string,
                index: number,
            ): { alliance_ids: number[]; alliance_names: string[] } => {
                return _rawData?.coalitions[index] as {
                    alliance_ids: number[];
                    alliance_names: string[];
                };
            },
        );

        kpiCollapsed = localStorage.getItem(kpiCollapseStorageKey()) === "1";

        bootstrapIdRouteLifecycle({
            restoreParams: ["layout", "sort", "order", "columns", "kpiw"],
            preserveParams: ["id"],
            onMissingId: () => {
                _loadError = "Missing conflict id in URL";
                _loaded = true;
            },
            onResolvedId: (id, queryParams) => {
                beginJourneySpan("journey.conflicts_to_conflict.firstMount", {
                    conflictId: id,
                });
                loadLayoutFromQuery(queryParams);
                conflictId = id;
                loadKpiConfigFromStorage();
                setupConflictTables(id);
            },
        });

        if (typeof ResizeObserver !== "undefined") {
            layoutPresetResizeObserver = new ResizeObserver(() => {
                updateLayoutPresetMode();
            });
            if (layoutPresetViewportEl) {
                layoutPresetResizeObserver.observe(layoutPresetViewportEl);
            }
            if (layoutPresetButtonsEl) {
                layoutPresetResizeObserver.observe(layoutPresetButtonsEl);
            }
        }

        window.setTimeout(updateLayoutPresetMode, 0);
    });

    onDestroy(() => {
        layoutPresetResizeObserver?.disconnect();
    });

    $: {
        const detectedKey = detectLayoutPresetKey();
        if (selectedLayoutPresetKey !== detectedKey) {
            selectedLayoutPresetKey = detectedKey;
        }
    }

    $: trimmedConflictId = conflictId?.trim() ?? "";
    $: isVirtualConflictId =
        trimmedConflictId.length > 0 && !/^\d+$/.test(trimmedConflictId);
    $: virtualConflictEditUrl = trimmedConflictId
        ? `https://locutus.link/#/temporary-conflicts?conflictId=${encodeURIComponent(trimmedConflictId)}`
        : null;

    $: if (layoutPresetViewportEl && layoutPresetButtonsEl) {
        updateLayoutPresetMode();
    }

    function handleClick(layout: number): void {
        _layoutData.layout =
            layout === Layout.ALLIANCE
                ? Layout.ALLIANCE
                : layout === Layout.NATION
                  ? Layout.NATION
                  : Layout.COALITION;
        syncUrlState({ clearLayoutSortAndColumns: true, persist: true });
        loadCurrentLayout();
    }

    function applyLayoutPresetKey(key: string): void {
        const layout = layouts[key];
        if (!layout) return;
        const nextOrder: "asc" | "desc" =
            layout.order === "asc" ? "asc" : "desc";
        if (
            isSameLayoutState({
                sort: layout.sort,
                order: nextOrder,
                columns: layout.columns,
            })
        ) {
            logConflictDebug("applyLayoutPresetKey no-op", { key });
            return;
        }
        const startedAt = performance.now();
        logConflictDebug("applyLayoutPresetKey start", {
            key,
            sort: layout.sort,
            order: nextOrder,
            columns: layout.columns.length,
        });
        const finishSpan = startPerfSpan("conflict.layout.preset.apply", {
            key,
            columns: layout.columns.length,
        });
        incrementPerfCounter("conflict.layout.preset.apply");
        _layoutData.columns = [...layout.columns];
        _layoutData.sort = layout.sort;
        _layoutData.order = nextOrder;
        selectedLayoutPresetKey = key;
        const syncStartedAt = performance.now();
        syncUrlState({ persist: true });
        logConflictDebug("applyLayoutPresetKey query sync complete", {
            key,
            elapsedMs: Number((performance.now() - syncStartedAt).toFixed(2)),
        });
        loadCurrentLayout();
        finishSpan();
        logConflictDebug("applyLayoutPresetKey end", {
            key,
            elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
        });
    }

    function buildLayoutPresetItems(): SelectionModalItem[] {
        return buildStringSelectionItems(layoutPresetKeys);
    }

    function applyAndPersistKpiConfig(config: unknown): void {
        applyKpiConfig(config);
        saveKpiConfig();
    }

    function replaceWithPresetCards(keys: PresetCardKey[]): void {
        if (keys.length === 0) return;
        kpiWidgets = keys.map((key) => ({
            id: makeKpiId("preset"),
            kind: "preset",
            key,
        }));
        saveKpiConfig();
    }

    function handleColumnPresetLoad(preset: ColumnPreset): void {
        const startedAt = performance.now();

        const nextSort = preset.sort || _layoutData.sort;
                const nextOrder: "asc" | "desc" =
                        preset.order === "asc"
                                ? "asc"
                                : preset.order === "desc"
                                    ? "desc"
                                    : _layoutData.order;
        const nextColumns = Array.isArray(preset.columns)
            ? [...preset.columns]
            : [..._layoutData.columns];

        const noLayoutChange = isSameLayoutState({
            sort: nextSort,
            order: nextOrder,
            columns: nextColumns,
        });

        logConflictDebug("column preset load start", {
            hasKpiConfig: !!preset.kpiConfig,
            noLayoutChange,
            columns: nextColumns.length,
            sort: nextSort,
            order: nextOrder,
        });

        incrementPerfCounter("conflict.layout.columnPreset.load");
        const finishSpan = startPerfSpan("conflict.layout.columnPreset.apply", {
            noLayoutChange,
            columns: nextColumns.length,
        });

        _layoutData.columns = nextColumns;
        _layoutData.sort = nextSort;
        _layoutData.order = nextOrder;

        selectedLayoutPresetKey = detectLayoutPresetKey();

        if (preset.kpiConfig) {
            applyAndPersistKpiConfig(preset.kpiConfig);
        } else if (Array.isArray(preset.kpis) && preset.kpis.length > 0) {
            const keys = preset.kpis
                .filter((key: string) => key in PRESET_CARD_LABELS)
                .map((key: string) => key as PresetCardKey);
            if (keys.length > 0) {
                replaceWithPresetCards(keys);
            }
        }

        syncUrlState({ persist: true });

        if (!noLayoutChange) {
            loadCurrentLayout();
        }

        finishSpan();
        logConflictDebug("column preset load end", {
            noLayoutChange,
            elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
        });
    }

    function detectLayoutPresetKey(): string | null {
        return detectConflictTableLayoutPresetKey(_layoutData);
    }

    function updateLayoutPresetMode(): void {
        if (!layoutPresetViewportEl || !layoutPresetButtonsEl) {
            showPresetOverflowMenu = true;
            return;
        }
        showPresetOverflowMenu =
            layoutPresetButtonsEl.scrollWidth > layoutPresetViewportEl.clientWidth;
    }

    function openLayoutPresetModal(): void {
        showLayoutPresetModal = true;
    }

    function closeLayoutPresetModal(): void {
        showLayoutPresetModal = false;
    }

    function openKpiBuilderModal(): void {
        showKpiBuilderModal = true;
    }

    function closeKpiBuilderModal(): void {
        showKpiBuilderModal = false;
    }

    function applyLayoutPresetModal(
        event: CustomEvent<{ ids: SelectionId[] }>,
    ): void {
        const key = firstSelectedString(event.detail.ids);
        if (!key || !(key in layouts)) return;
        applyLayoutPresetKey(key);
        showLayoutPresetModal = false;
    }

    function resetFilters() {
        _layoutData.layout = Layout.COALITION;
        _layoutData.columns = [...DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.columns];
        _layoutData.sort = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET.sort;
        _layoutData.order = "desc";
        selectedLayoutPresetKey = DEFAULT_CONFLICT_TABLE_LAYOUT_PRESET_KEY;

        kpiWidgetActions.setWidgets([...DEFAULT_KPI_WIDGETS]);

        syncUrlState({ includeKpi: true, replace: true, persist: true });
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
        <div class="ux-page-title-stack">
            <Breadcrumbs
                items={[
                    { label: "Home", href: `${base}/` },
                    { label: "Conflicts", href: `${base}/conflicts` },
                    {
                        label: conflictName || "Conflict",
                        href: conflictId
                            ? `${base}/conflict?id=` + conflictId
                            : undefined,
                    },
                    { label: currentLayoutLabel },
                ]}
            />
            <span class="ux-page-title-main">Conflict: {conflictName}</span>
        </div>
        {#if (isVirtualConflictId && virtualConflictEditUrl) || _rawData?.wiki}
            <div class="d-flex align-items-center gap-2">
                {#if isVirtualConflictId && virtualConflictEditUrl}
                    <a
                        class="btn ux-btn ux-btn-danger fw-bold"
                        href={virtualConflictEditUrl}
                        target="_blank"
                        rel="noopener noreferrer">Edit</a
                    >
                {/if}
                {#if _rawData?.wiki}
                    <a
                        class="btn ux-btn fw-bold"
                        href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}"
                        >Wiki:{_rawData?.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"
                        ></i></a
                    >
                {/if}
            </div>
        {/if}
    </h1>

    <ConflictRouteTabs
        {conflictId}
        mode="layout-picker"
        routeKind="single"
        currentLayout={_layoutData.layout}
        active={layoutTabFromIndex(_layoutData.layout)}
        onLayoutSelect={handleClick}
    />

    <ul
        class="layout-picker-bar ux-floating-controls nav fw-bold nav-pills m-0 p-2 ux-surface mb-3 d-flex flex-wrap gap-1"
    >
        <li class="layout-preset-slot d-flex align-items-center gap-2 me-1">
            <span>Layout Picker:</span>
            <div class="layout-preset-viewport" bind:this={layoutPresetViewportEl}>
                <div
                    class="layout-preset-buttons"
                    class:layout-preset-buttons-hidden={showPresetOverflowMenu}
                    bind:this={layoutPresetButtonsEl}
                >
                    {#each layoutPresetKeys as key}
                        <button
                            class="btn btn-sm fw-bold"
                            class:ux-btn={selectedLayoutPresetKey === key}
                            class:btn-outline-secondary={selectedLayoutPresetKey !== key}
                            on:click={() => applyLayoutPresetKey(key)}>{key}</button
                        >
                    {/each}
                </div>
                {#if showPresetOverflowMenu}
                    <button
                        class="btn ux-btn btn-sm fw-bold layout-preset-more"
                        on:click={openLayoutPresetModal}>More presets</button
                    >
                {/if}
            </div>
        </li>

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
                on:load={(e) => handleColumnPresetLoad(e.detail.preset)}
            />
        </li>

        {#if kpiCollapsed}
            <li>
                <button class="btn ux-btn btn-sm" on:click={showKpi}
                    >Show KPI</button
                >
            </li>
        {/if}

        <li class="ms-auto">
            <button class="btn ux-btn btn-sm" on:click={openKpiBuilderModal}
                >KPI Builder</button
            >
        </li>

        <li class="d-flex flex-wrap gap-1 justify-content-end">
            <ShareResetBar
                onReset={resetFilters}
                onSharePrepare={syncShareStateToUrl}
                resetDirty={isResetDirty}
            />
        </li>
    </ul>

    <ConflictKpiSection
        visible={!!_rawData && !kpiCollapsed}
        {kpiWidgets}
        {draggingWidgetId}
        {durationSoFar}
        {warsTracked}
        {totalDamage}
        {damageGap}
        {leadingCoalition}
        {coalitionSummary}
        {offWarsPerNationStats}
        {formatKpiNumber}
        getRankingRows={(card) => kpiComputations.getRankingRows(card)}
        getMetricCardValue={(card) => kpiComputations.getMetricCardValue(card)}
        {metricLabel}
        {widgetScopeLabel}
        {getAavaMetricLabel}
        on:toggleCollapse={toggleKpiCollapsed}
        on:startDrag={(event) => startWidgetDrag(event.detail.id)}
        on:endDrag={endWidgetDrag}
        on:dropOn={(event) => dropWidgetOn(event.detail.id)}
        on:removeWidget={(event) => kpiWidgetActions.removeWidget(event.detail.id)}
    />

    <SelectionModal
        open={showLayoutPresetModal}
        title="Choose Layout Preset"
        description="Pick a preset column layout for the current conflict table."
        items={buildLayoutPresetItems()}
        selectedIds={selectedLayoutPresetKey
            ? [selectedLayoutPresetKey as string]
            : []}
        applyLabel="Use preset"
        singleSelect={true}
        searchPlaceholder="Search presets..."
        on:close={closeLayoutPresetModal}
        on:apply={applyLayoutPresetModal}
        validateSelection={(ids) =>
            validateSingleSelection(ids, "layout preset")}
    />

    <KpiBuilderModal
        open={showKpiBuilderModal}
        title="KPI Builder"
        description="Add and arrange KPI widgets."
        widgets={kpiWidgets}
        presetCardLabels={PRESET_CARD_LABELS}
        presetCardDescriptions={PRESET_CARD_DESCRIPTIONS}
        scopeOptions={[
            { value: "all", label: "All" },
            { value: "coalition1", label: "Coalition 1" },
            { value: "coalition2", label: "Coalition 2" },
            { value: "selection", label: "Selection snapshot" },
        ]}
        {metricsOptions}
        {selectedSnapshotLabel}
        canAddRanking={hasSelectionForScopeFromState(
            rankingScopeToAdd,
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        )}
        canAddMetric={hasSelectionForScopeFromState(
            metricScopeToAdd,
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        )}
        canAddRankingReason={kpiAddReasonForScopeFromState(
            rankingScopeToAdd,
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        )}
        canAddMetricReason={kpiAddReasonForScopeFromState(
            metricScopeToAdd,
            selectedAllianceIdsForKpi,
            selectedNationIdsForKpi,
        )}
        {widgetManagerLabel}
        {metricLabel}
        {metricDescription}
        showAavaHint={!!conflictId}
        aavaHref={conflictId ? `aava?id=${conflictId}` : null}
        on:close={closeKpiBuilderModal}
        on:removeWidget={(event) => kpiWidgetActions.removeWidget(event.detail.id)}
        on:moveWidget={(event) =>
            kpiWidgetActions.moveWidget(event.detail.id, event.detail.delta)}
        on:addPreset={(event) => kpiWidgetActions.addPresetCard(event.detail.key)}
        on:addRanking={() =>
            kpiWidgetActions.addRankingCard({
                entity: rankingEntityToAdd,
                metric: rankingMetricToAdd,
                scope: rankingScopeToAdd,
                limit: rankingLimitToAdd,
            })}
        on:addMetric={() =>
            kpiWidgetActions.addMetricCard({
                entity: metricEntityToAdd,
                metric: metricMetricToAdd,
                scope: metricScopeToAdd,
                aggregation: metricAggToAdd,
                normalizeBy: metricNormalizeByToAdd,
            })}
        bind:rankingEntityToAdd
        bind:rankingMetricToAdd
        bind:rankingScopeToAdd
        bind:rankingLimitToAdd
        bind:metricEntityToAdd
        bind:metricMetricToAdd
        bind:metricScopeToAdd
        bind:metricAggToAdd
        bind:metricNormalizeByToAdd
    />

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

<style>
    .layout-preset-slot {
        min-width: 0;
        flex: 1 1 640px;
    }

    .layout-preset-viewport {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
        position: relative;
    }

    .layout-preset-buttons {
        display: inline-flex;
        flex-wrap: nowrap;
        gap: 0.25rem;
        white-space: nowrap;
    }

    .layout-preset-buttons-hidden {
        visibility: hidden;
        pointer-events: none;
    }

    .layout-preset-more {
        position: absolute;
        top: 0;
        left: 0;
    }

    @media (max-width: 991.98px) {
        .layout-preset-slot {
            flex: 1 1 100%;
        }
    }
</style>

