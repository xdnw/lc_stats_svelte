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
    import ColumnPresetManager from "../../components/ColumnPresetManager.svelte";
    import { config } from "../+layout";

    const Layout = {
        COALITION: 0,
        ALLIANCE: 1,
        NATION: 2,
    };

    type WidgetScope = "all" | "coalition1" | "coalition2";
    type WidgetEntity = "alliance" | "nation";
    type PresetCardKey =
        | "duration"
        | "wars"
        | "damage-total"
        | "net-gap"
        | "c1-dealt"
        | "c2-dealt";

    type RankingCard = {
        id: string;
        kind: "ranking";
        entity: WidgetEntity;
        metric: string;
        scope: WidgetScope;
        limit: number;
    };

    type MetricCard = {
        id: string;
        kind: "metric";
        entity: WidgetEntity;
        metric: string;
        scope: WidgetScope;
        aggregation: "sum" | "avg";
    };

    type PresetCard = {
        id: string;
        kind: "preset";
        key: PresetCardKey;
    };

    type KPIWidget = RankingCard | MetricCard | PresetCard;

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
    const getVis = (): any => (window as any).vis;

    const DEFAULT_PRESET_CARDS: PresetCard[] = [
        { id: "preset-duration", kind: "preset", key: "duration" },
        { id: "preset-wars", kind: "preset", key: "wars" },
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
    };

    const SCOPE_LABELS: Record<WidgetScope, string> = {
        all: "All",
        coalition1: "Coalition 1",
        coalition2: "Coalition 2",
    };

    let presetCards: PresetCard[] = [...DEFAULT_PRESET_CARDS];
    let rankingCards: RankingCard[] = [...DEFAULT_RANKING_CARDS];
    let metricCards: MetricCard[] = [];
    let kpiCollapsed = false;

    let rankingEntityToAdd: WidgetEntity = "nation";
    let rankingMetricToAdd = "net:damage";
    let rankingScopeToAdd: WidgetScope = "all";
    let rankingLimitToAdd = 10;

    let metricEntityToAdd: WidgetEntity = "nation";
    let metricMetricToAdd = "net:damage";
    let metricScopeToAdd: WidgetScope = "all";
    let metricAggToAdd: "sum" | "avg" = "sum";

    const kpiCollapseStorageKey = () => `${getPageStorageKey()}:kpi-collapsed`;
    const kpiConfigStorageKey = () => `${getPageStorageKey()}:kpi-config`;

    function formatKpiNumber(value: number | null | undefined): string {
        if (value == null || isNaN(value)) return "N/A";
        return value.toLocaleString();
    }

    function makeId(prefix: string): string {
        return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function saveKpiConfig() {
        const config = {
            presetCards,
            rankingCards,
            metricCards,
        };
        localStorage.setItem(kpiConfigStorageKey(), JSON.stringify(config));
    }

    function applyKpiConfig(config: any) {
        if (!config || typeof config !== "object") return;
        if (Array.isArray(config.presetCards)) {
            presetCards = config.presetCards.filter(
                (w: any) =>
                    w?.kind === "preset" &&
                    PRESET_CARD_LABELS[w?.key as PresetCardKey],
            );
        }
        if (Array.isArray(config.rankingCards)) {
            rankingCards = config.rankingCards.filter(
                (w: any) =>
                    w?.kind === "ranking" &&
                    (w?.entity === "alliance" || w?.entity === "nation") &&
                    (w?.scope === "all" ||
                        w?.scope === "coalition1" ||
                        w?.scope === "coalition2") &&
                    typeof w?.metric === "string",
            );
        }
        if (Array.isArray(config.metricCards)) {
            metricCards = config.metricCards.filter(
                (w: any) =>
                    w?.kind === "metric" &&
                    (w?.entity === "alliance" || w?.entity === "nation") &&
                    (w?.scope === "all" ||
                        w?.scope === "coalition1" ||
                        w?.scope === "coalition2") &&
                    (w?.aggregation === "sum" || w?.aggregation === "avg") &&
                    typeof w?.metric === "string",
            );
        }
    }

    function loadKpiConfigFromStorage() {
        try {
            const raw = localStorage.getItem(kpiConfigStorageKey());
            if (!raw) return;
            applyKpiConfig(JSON.parse(raw));
        } catch (error) {
            console.warn("Failed to read KPI config", error);
        }
    }

    function removeWidget(kind: KPIWidget["kind"], id: string) {
        if (kind === "preset") {
            presetCards = presetCards.filter((w) => w.id !== id);
        } else if (kind === "ranking") {
            rankingCards = rankingCards.filter((w) => w.id !== id);
        } else {
            metricCards = metricCards.filter((w) => w.id !== id);
        }
        saveKpiConfig();
    }

    function moveWidget(kind: KPIWidget["kind"], id: string, delta: number) {
        if (kind === "preset") {
            const list = [...presetCards];
            const index = list.findIndex((w) => w.id === id);
            if (index === -1) return;
            const newIndex = index + delta;
            if (newIndex < 0 || newIndex >= list.length) return;
            const [item] = list.splice(index, 1);
            list.splice(newIndex, 0, item);
            presetCards = list;
        } else if (kind === "ranking") {
            const list = [...rankingCards];
            const index = list.findIndex((w) => w.id === id);
            if (index === -1) return;
            const newIndex = index + delta;
            if (newIndex < 0 || newIndex >= list.length) return;
            const [item] = list.splice(index, 1);
            list.splice(newIndex, 0, item);
            rankingCards = list;
        } else {
            const list = [...metricCards];
            const index = list.findIndex((w) => w.id === id);
            if (index === -1) return;
            const newIndex = index + delta;
            if (newIndex < 0 || newIndex >= list.length) return;
            const [item] = list.splice(index, 1);
            list.splice(newIndex, 0, item);
            metricCards = list;
        }
        saveKpiConfig();
    }

    function addPresetCard(key: PresetCardKey) {
        presetCards = [
            ...presetCards,
            { id: makeId("preset"), kind: "preset", key },
        ];
        saveKpiConfig();
    }

    function addRankingCard() {
        rankingCards = [
            ...rankingCards,
            {
                id: makeId("ranking"),
                kind: "ranking",
                entity: rankingEntityToAdd,
                metric: rankingMetricToAdd,
                scope: rankingScopeToAdd,
                limit: Math.max(1, rankingLimitToAdd),
            },
        ];
        saveKpiConfig();
    }

    function addMetricCard() {
        metricCards = [
            ...metricCards,
            {
                id: makeId("metric"),
                kind: "metric",
                entity: metricEntityToAdd,
                metric: metricMetricToAdd,
                scope: metricScopeToAdd,
                aggregation: metricAggToAdd,
            },
        ];
        saveKpiConfig();
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
            presetCards = parsed.map((key) => ({
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

    function getScopedRows(
        entity: WidgetEntity,
        scope: WidgetScope,
        table: TableData,
    ): any[] {
        if (!_rawData || scope === "all") return table.data;

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
        const table = getEntityTable(card.entity);
        if (!table) return [];
        const metricIndex = table.columns.indexOf(card.metric);
        if (metricIndex === -1) return [];

        const rows = getScopedRows(card.entity, card.scope, table);
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
        const table = getEntityTable(card.entity);
        if (!table) return null;
        const metricIndex = table.columns.indexOf(card.metric);
        if (metricIndex === -1) return null;
        const rows = getScopedRows(card.entity, card.scope, table);
        const vals = rows.map((row) => Number(row[metricIndex]) || 0);
        if (vals.length === 0) return null;
        const sum = vals.reduce((a, b) => a + b, 0);
        return card.aggregation === "avg" ? sum / vals.length : sum;
    }

    function metricLabel(metric: string): string {
        return trimHeader(metric);
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

        (window as any).getIds = (
            _coalitionName: string,
            index: number,
        ): { alliance_ids: number[]; alliance_names: string[] } => {
            return _rawData?.coalitions[index] as {
                alliance_ids: number[];
                alliance_names: string[];
            };
        };

        (window as any).formatNation = (data: any) => {
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
        };

        (window as any).formatAA = (data: any) => {
            let allianceId = data[1] as number;
            let allianceName = formatAllianceName(data[0], allianceId);
            return (
                '<a href="https://politicsandwar.com/alliance/id=' +
                allianceId +
                '">' +
                allianceName +
                "</a>"
            );
        };

        (window as any).formatCol = (data: any) => {
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
        };

        (window as any).download = function download(
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
        };

        let queryParams = new URLSearchParams(window.location.search);
        loadLayoutFromQuery(queryParams);
        loadKpiConfigFromStorage();
        kpiCollapsed = localStorage.getItem(kpiCollapseStorageKey()) === "1";

        const id = queryParams.get("id");
        if (id) {
            conflictId = id;
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

        presetCards = [...DEFAULT_PRESET_CARDS];
        rankingCards = [...DEFAULT_RANKING_CARDS];
        metricCards = [];
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
        class="layout-picker-bar nav fw-bold nav-pills m-0 p-2 ux-surface mb-3 d-flex flex-wrap gap-1"
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
                currentKpiConfig={{ presetCards, rankingCards, metricCards }}
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
                            presetCards = keys.map((key: PresetCardKey) => ({
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

        <li class="dropdown" data-bs-auto-close="outside">
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
                <div class="small text-muted mb-1">Preset cards</div>
                {#if presetCards.length === 0}
                    <div class="small text-muted mb-2">No preset cards</div>
                {/if}
                {#each presetCards as card, idx}
                    <div
                        class="d-flex align-items-center justify-content-between gap-2 mb-1"
                    >
                        <span class="small text-truncate"
                            >{PRESET_CARD_LABELS[card.key]}</span
                        >
                        <div class="d-flex gap-1">
                            <button
                                class="btn btn-sm btn-outline-secondary"
                                on:click={() =>
                                    moveWidget("preset", card.id, -1)}
                                disabled={idx === 0}>↑</button
                            >
                            <button
                                class="btn btn-sm btn-outline-secondary"
                                on:click={() =>
                                    moveWidget("preset", card.id, 1)}
                                disabled={idx === presetCards.length - 1}
                                >↓</button
                            >
                            <button
                                class="btn btn-sm btn-outline-danger"
                                on:click={() => removeWidget("preset", card.id)}
                                >Remove</button
                            >
                        </div>
                    </div>
                {/each}
                <div class="d-flex flex-wrap gap-1 mb-2">
                    {#each Object.keys(PRESET_CARD_LABELS) as key}
                        <button
                            class="btn btn-sm btn-outline-secondary"
                            on:click={() => addPresetCard(key as PresetCardKey)}
                            >+ {PRESET_CARD_LABELS[
                                key as PresetCardKey
                            ]}</button
                        >
                    {/each}
                </div>

                <hr class="dropdown-divider" />
                <div class="small text-muted mb-1">Ranking cards</div>
                {#each rankingCards as card, idx}
                    <div
                        class="d-flex align-items-center justify-content-between gap-2 mb-1"
                    >
                        <span class="small text-truncate"
                            >{card.entity} · {metricLabel(card.metric)} · {SCOPE_LABELS[
                                card.scope
                            ]} · top {card.limit}</span
                        >
                        <div class="d-flex gap-1">
                            <button
                                class="btn btn-sm btn-outline-secondary"
                                on:click={() =>
                                    moveWidget("ranking", card.id, -1)}
                                disabled={idx === 0}>↑</button
                            >
                            <button
                                class="btn btn-sm btn-outline-secondary"
                                on:click={() =>
                                    moveWidget("ranking", card.id, 1)}
                                disabled={idx === rankingCards.length - 1}
                                >↓</button
                            >
                            <button
                                class="btn btn-sm btn-outline-danger"
                                on:click={() =>
                                    removeWidget("ranking", card.id)}
                                >Remove</button
                            >
                        </div>
                    </div>
                {/each}

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
                            class="btn btn-sm btn-outline-secondary w-100"
                            on:click={addRankingCard}>+ Add ranking card</button
                        >
                    </div>
                </div>

                <hr class="dropdown-divider" />
                <div class="small text-muted mb-1">Metric cards</div>
                {#each metricCards as card, idx}
                    <div
                        class="d-flex align-items-center justify-content-between gap-2 mb-1"
                    >
                        <span class="small text-truncate"
                            >{card.aggregation.toUpperCase()}
                            {card.entity} · {metricLabel(card.metric)} · {SCOPE_LABELS[
                                card.scope
                            ]}</span
                        >
                        <div class="d-flex gap-1">
                            <button
                                class="btn btn-sm btn-outline-secondary"
                                on:click={() =>
                                    moveWidget("metric", card.id, -1)}
                                disabled={idx === 0}>↑</button
                            >
                            <button
                                class="btn btn-sm btn-outline-secondary"
                                on:click={() =>
                                    moveWidget("metric", card.id, 1)}
                                disabled={idx === metricCards.length - 1}
                                >↓</button
                            >
                            <button
                                class="btn btn-sm btn-outline-danger"
                                on:click={() => removeWidget("metric", card.id)}
                                >Remove</button
                            >
                        </div>
                    </div>
                {/each}

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
                        <button
                            class="btn btn-sm btn-outline-secondary w-100"
                            on:click={addMetricCard}>+ Add metric card</button
                        >
                    </div>
                </div>
            </div>
        </li>

        <li class="ms-auto d-flex flex-wrap gap-1 justify-content-end">
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
                {#each presetCards as card}
                    {#if card.key === "duration"}
                        <div class="col-12 col-sm-6 col-xl-4">
                            <div class="ux-surface p-3 rounded border h-100">
                                <div class="small text-muted">Duration</div>
                                <div class="h6 m-0">{durationSoFar}</div>
                            </div>
                        </div>
                    {:else if card.key === "wars"}
                        <div class="col-12 col-sm-6 col-xl-4">
                            <div class="ux-surface p-3 rounded border h-100">
                                <div class="small text-muted">Wars tracked</div>
                                <div class="h6 m-0">
                                    {formatKpiNumber(warsTracked)}
                                </div>
                            </div>
                        </div>
                    {:else if card.key === "damage-total"}
                        <div class="col-12 col-sm-6 col-xl-4">
                            <div class="ux-surface p-3 rounded border h-100">
                                <div class="small text-muted">
                                    Total damage exchanged
                                </div>
                                <div class="h6 m-0">
                                    {formatKpiNumber(totalDamage)}
                                </div>
                            </div>
                        </div>
                    {:else if card.key === "net-gap"}
                        <div class="col-12 col-sm-6 col-xl-4">
                            <div class="ux-surface p-3 rounded border h-100">
                                <div class="small text-muted">Damage gap</div>
                                <div class="h6 m-0">
                                    {formatKpiNumber(damageGap)}
                                </div>
                                {#if leadingCoalition}<div
                                        class="small text-muted"
                                    >
                                        Lead: {leadingCoalition.name}
                                    </div>{/if}
                            </div>
                        </div>
                    {:else if card.key === "c1-dealt"}
                        <div class="col-12 col-sm-6 col-xl-4">
                            <div class="ux-surface p-3 rounded border h-100">
                                <div class="small text-muted">
                                    {coalitionSummary?.[0]?.name ??
                                        "Coalition 1"} dealt
                                </div>
                                <div class="h6 m-0">
                                    {formatKpiNumber(
                                        coalitionSummary?.[0]?.dealt,
                                    )}
                                </div>
                            </div>
                        </div>
                    {:else if card.key === "c2-dealt"}
                        <div class="col-12 col-sm-6 col-xl-4">
                            <div class="ux-surface p-3 rounded border h-100">
                                <div class="small text-muted">
                                    {coalitionSummary?.[1]?.name ??
                                        "Coalition 2"} dealt
                                </div>
                                <div class="h6 m-0">
                                    {formatKpiNumber(
                                        coalitionSummary?.[1]?.dealt,
                                    )}
                                </div>
                            </div>
                        </div>
                    {/if}
                {/each}

                {#each rankingCards as card}
                    {@const rows = getRankingRows(card)}
                    <div class="col-12 col-lg-6">
                        <div class="ux-surface p-3 rounded border h-100">
                            <div class="small text-muted mb-1">
                                Top {card.limit}
                                {card.entity}s by {metricLabel(card.metric)} ({SCOPE_LABELS[
                                    card.scope
                                ]})
                            </div>
                            <div class="table-responsive">
                                <table class="table table-sm table-striped m-0">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th
                                                >{card.entity === "alliance"
                                                    ? "Alliance"
                                                    : "Nation"}</th
                                            >
                                            {#if card.entity === "nation"}<th
                                                    >Alliance</th
                                                >{/if}
                                            <th class="text-end">Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each rows as row, i}
                                            <tr>
                                                <td>{i + 1}</td>
                                                <td>{row.label}</td>
                                                {#if card.entity === "nation"}<td
                                                        >{row.alliance}</td
                                                    >{/if}
                                                <td class="text-end"
                                                    >{row.value.toLocaleString()}</td
                                                >
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                {/each}

                {#each metricCards as card}
                    <div class="col-12 col-sm-6 col-xl-4">
                        <div class="ux-surface p-3 rounded border h-100">
                            <div class="small text-muted">
                                {card.aggregation.toUpperCase()}
                                {card.entity}
                                {metricLabel(card.metric)} ({SCOPE_LABELS[
                                    card.scope
                                ]})
                            </div>
                            <div class="h6 m-0">
                                {formatKpiNumber(getMetricCardValue(card))}
                            </div>
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

<style>
    .layout-picker-bar {
        position: relative;
        overflow: visible;
        z-index: 20;
    }

    .layout-picker-bar .dropdown,
    .layout-picker-bar li {
        position: relative;
    }

    .layout-picker-bar .dropdown-menu {
        z-index: 1080;
        max-height: 70vh;
        overflow-y: auto;
    }
</style>
