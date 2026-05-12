<script lang="ts">
    // @ts-nocheck
    import "../../styles/conflict-shell.css";
    import "../../styles/conflict-widgets.css";
    import { base } from "$app/paths";
    import {
        buildStringSelectionItems,
        firstSelectedString,
        validateSingleSelection,
    } from "$lib/selectionModalHelpers";
    import { decompressBson } from "$lib/binary";
    import type { Conflict } from "$lib/types";
    import { getCurrentQueryParams, setQueryParam, resetQueryParams } from "$lib/queryState";
    import { bootstrapIdRouteLifecycle } from "$lib/routeBootstrap";
    import {
        generateColorsFromPalettes,
        Palette,
        darkenColor,
    } from "$lib/colors";
    import { commafy, formatAllianceName } from "$lib/formatting";
    import { toggleCoalitionAllianceSelection } from "$lib/graphMetrics";
    import { getConflictDataUrl, formatDatasetProvenance } from "$lib/runtime";
    import { saveCurrentQueryParams } from "$lib/queryStorage";
    import {
        getDefaultWarWebHeader,
        rankWarWebAllianceIdsByTotalMetric,
        resolveWarWebMetricMeta,
    } from "$lib/warWeb";
    import { yieldToMain } from "$lib/misc";
    import { startPerfSpan } from "$lib/perf";
    import {
        buildSettingsRows,
        exportBundleData,
        type ExportDatasetOption,
    } from "$lib/dataExport";
    import { onMount } from "svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ExportDataMenu from "../../components/ExportDataMenu.svelte";
    import Icon from "../../components/Icon.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import AllianceFilterModal from "../../components/AllianceFilterModal.svelte";
    import SelectionModal from "../../components/SelectionModal.svelte";
    import type {
        SelectionId,
        SelectionModalItem,
    } from "$lib/selection/types";
    import type { ExportMenuAction } from "../../components/exportMenuTypes";
    import { chordDirected, ribbonArrow } from "d3-chord";
    import { select } from "d3-selection";
    import { arc } from "d3-shape";
    import { appConfig as config } from "$lib/appConfig";

    let conflictName = "";
    let conflictId: string | null = null;

    let _rawData: Conflict | null = null;
    let _allowedAllianceIds: Set<number> = new Set();
    let _currentHeaderName: string = "wars";
    let headerModalItems: SelectionModalItem[] = [];
    let _loaded = false;
    let _loadError: string | null = null;
    let datasetProvenance = "";
    let topAllianceCountInput = "5";
    let selectedChordExportDataset = "matrix";
    let chordExportState: {
        header: string;
        labels: string[];
        allianceIds: number[];
        coalitionIds: number[];
        matrix: number[][];
    } | null = null;
    let lastChordLayoutKey: string | null = null;
    const chordExportDatasets: ExportDatasetOption[] = [
        {
            key: "matrix",
            label: "Full directed matrix",
        },
        {
            key: "edges",
            label: "Edge list (non-zero)",
        },
        {
            key: "settings",
            label: "Current filter settings",
        },
    ];
    const chordEdgeExportColumns = [
        "from_alliance",
        "from_alliance_id",
        "from_coalition",
        "to_alliance",
        "to_alliance_id",
        "to_coalition",
        "value",
    ];
    $: isResetDirty = (() => {
        if (!_rawData) return false;
        const defaultHeader = getDefaultWarWebHeader(_rawData);
        const defaultAllianceCount =
            _rawData.coalitions[0].alliance_ids.length +
            _rawData.coalitions[1].alliance_ids.length;
        return (
            _currentHeaderName !== defaultHeader ||
            _allowedAllianceIds.size !== defaultAllianceCount
        );
    })();

    onMount(() => {
        bootstrapIdRouteLifecycle({
            restoreParams: ["header", "ids"],
            preserveParams: ["id"],
            onMissingId: () => {
                _loadError = "Missing conflict id in URL";
                _loaded = true;
            },
            onResolvedId: (id, queryParams) => {
                conflictId = id;
                setupWebFromId(id, queryParams);
            },
        });
    });

    function setupWebFromId(conflictId: string, queryParams: URLSearchParams) {
        _loadError = null;
        _loaded = false;
        let url = getConflictDataUrl(conflictId, config.version.conflict_data);
        decompressBson(url, {
            strategy: "worker-bytes",
        })
            .then(async (data) => {
                _rawData = data;
                conflictName = data.name;
                datasetProvenance = formatDatasetProvenance(
                    config.version.conflict_data,
                    (data as any).update_ms,
                );
                _allowedAllianceIds = new Set([
                    ...data.coalitions[0].alliance_ids,
                    ...data.coalitions[1].alliance_ids,
                ]);

                _currentHeaderName = getDefaultWarWebHeader(data);
                let header = queryParams.get("header");
                if (header && _rawData?.war_web.headers.includes(header)) {
                    _currentHeaderName = header;
                }
                let idStr = queryParams.get("ids");
                if (idStr) {
                    let ids = idStr.split(".").map((id) => +id);
                    _allowedAllianceIds = new Set(ids);
                    if (
                        !_rawData?.coalitions[0].alliance_ids.some((id) =>
                            _allowedAllianceIds.has(id),
                        ) ||
                        !_rawData?.coalitions[1].alliance_ids.some((id) =>
                            _allowedAllianceIds.has(id),
                        )
                    ) {
                        _allowedAllianceIds = new Set([
                            ...data.coalitions[0].alliance_ids,
                            ...data.coalitions[1].alliance_ids,
                        ]);
                    }
                }
                await yieldToMain();
                lastChordLayoutKey = null;
                setupWebWithCurrentLayout();
                _loaded = true;
                saveCurrentQueryParams();
            })
            .catch((error) => {
                console.error("Failed to load chord web data", error);
                _loadError =
                    "Could not load conflict web data. Please try again later.";
                _loaded = true;
            });
    }

    function setLayoutHeader(headerName: string) {
        _currentHeaderName = headerName;
        setQueryParam("header", headerName);
        saveCurrentQueryParams();
        setupWebWithCurrentLayout();
    }

    function applyHeaderModal(event: CustomEvent<{ ids: SelectionId[] }>) {
        const nextHeader = firstSelectedString(event.detail.ids);
        if (!nextHeader) return;
        setLayoutHeader(nextHeader);
    }

    $: headerModalItems = buildStringSelectionItems(
        _rawData?.war_web.headers ?? [],
    );

    function setLayoutAlliance(coalitionIndex: number, allianceId: number) {
        if (!_rawData) return;
        _allowedAllianceIds = toggleCoalitionAllianceSelection(
            _allowedAllianceIds,
            _rawData.coalitions,
            coalitionIndex,
            allianceId,
        );
        setQueryParam("ids", Array.from(_allowedAllianceIds).join("."));
        saveCurrentQueryParams();
        setupWebWithCurrentLayout();
    }

    function commitAllowedAllianceIds(nextAllowedAllianceIds: number[]): void {
        if (!_rawData) return;
        _allowedAllianceIds = new Set(nextAllowedAllianceIds);
        setQueryParam("ids", Array.from(_allowedAllianceIds).join("."));
        saveCurrentQueryParams();
        setupWebWithCurrentLayout();
    }

    function parseTopAllianceCount(value: string): number {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    function selectTopAlliancesForCurrentHeader(): void {
        if (!_rawData) return;
        const requestedCount = parseTopAllianceCount(topAllianceCountInput);
        const [coalition0Ids, coalition1Ids] =
            rankWarWebAllianceIdsByTotalMetric(_rawData, _currentHeaderName);
        topAllianceCountInput = String(requestedCount);
        commitAllowedAllianceIds([
            ...coalition0Ids.slice(0, requestedCount),
            ...coalition1Ids.slice(0, requestedCount),
        ]);
    }

    function resetFilters() {
        if (!_rawData) return;
        lastChordLayoutKey = null;
        _currentHeaderName = getDefaultWarWebHeader(_rawData);
        _allowedAllianceIds = new Set([
            ..._rawData.coalitions[0].alliance_ids,
            ..._rawData.coalitions[1].alliance_ids,
        ]);
        resetQueryParams(["header", "ids"], ["id"]);
        saveCurrentQueryParams();
        setupWebWithCurrentLayout();
    }

    function retryLoad() {
        if (!conflictId) return;
        const queryParams = getCurrentQueryParams();
        setupWebFromId(conflictId, queryParams);
    }

    function setupWebWithCurrentLayout() {
        const layoutKey = `${_currentHeaderName}|${Array.from(_allowedAllianceIds)
            .sort((a, b) => a - b)
            .join(".")}`;
        if (layoutKey === lastChordLayoutKey) {
            return;
        }
        lastChordLayoutKey = layoutKey;
        setupWebWithLayout(
            _rawData as Conflict,
            _allowedAllianceIds,
            _currentHeaderName,
        );
    }

    function setupWebWithLayout(
        data: Conflict,
        allowedAllianceIdsSet: Set<number>,
        header: string,
    ) {
        const finishSpan = startPerfSpan("graph.chord.setupLayout", {
            selectedAllianceCount: allowedAllianceIdsSet.size,
            header,
        });
        // let allowedAllianceIds: number[] = [...data.coalitions[0].alliance_ids, 11657];

        let labels: string[] = [];
        let keptIndices: number[] = [];
        let alliance_ids: number[] = [];
        let coalition_ids: number[] = [];
        let palettes: Palette[] = [];
        let globalAllianceIndex = 0;
        for (let coalitionIndex = 0; coalitionIndex < data.coalitions.length; coalitionIndex++) {
            const coalition = data.coalitions[coalitionIndex];
            const palette = coalitionIndex === 0 ? Palette.REDS : Palette.BLUES;
            for (let localIndex = 0; localIndex < coalition.alliance_ids.length; localIndex++) {
                const aaId = coalition.alliance_ids[localIndex];
                if (allowedAllianceIdsSet.has(aaId)) {
                    keptIndices.push(globalAllianceIndex);
                    alliance_ids.push(aaId);
                    labels.push(formatAllianceName(coalition.alliance_names[localIndex], aaId));
                    coalition_ids.push(coalitionIndex);
                    palettes.push(palette);
                }
                globalAllianceIndex++;
            }
        }
        let colors = generateColorsFromPalettes(palettes);

        let headers = data.war_web.headers;
        let hI = headers.indexOf(header);

        let allMatrix = data.war_web.data[hI];
        let matrix: number[][] = new Array(keptIndices.length);

        for (let rowIndex = 0; rowIndex < keptIndices.length; rowIndex++) {
            const sourceRow = allMatrix[keptIndices[rowIndex]] ?? [];
            const matrixRow = new Array(keptIndices.length);
            for (let colIndex = 0; colIndex < keptIndices.length; colIndex++) {
                const rawValue = sourceRow[keptIndices[colIndex]];
                const value =
                    typeof rawValue === "number" ? rawValue : Number(rawValue);
                matrixRow[colIndex] =
                    Number.isFinite(value) && value >= 0 ? value : 0;
            }
            matrix[rowIndex] = matrixRow;
        }
        chordExportState = {
            header,
            labels: labels.slice(),
            allianceIds: alliance_ids.slice(),
            coalitionIds: coalition_ids.slice(),
            matrix,
        };
        setupChord(matrix, labels, colors, alliance_ids, coalition_ids);
        finishSpan();
    }

    function handleChordExport(action: ExportMenuAction): void {
        if (!chordExportState) return;

        const { labels, allianceIds, coalitionIds, matrix, header } =
            chordExportState;
        const matrixRows: (string | number)[][] = [];
        const edgeRows: (string | number)[][] = [];

        for (let from = 0; from < matrix.length; from++) {
            for (let to = 0; to < matrix[from].length; to++) {
                const value = matrix[from][to] ?? 0;
                const row: (string | number)[] = [
                    labels[from] ?? `AA:${allianceIds[from]}`,
                    allianceIds[from] ?? -1,
                    coalitionIds[from] ?? -1,
                    labels[to] ?? `AA:${allianceIds[to]}`,
                    allianceIds[to] ?? -1,
                    coalitionIds[to] ?? -1,
                    value,
                ];
                matrixRows.push(row);
                if (value > 0) {
                    edgeRows.push(row);
                }
            }
        }

        const settingsRows = buildSettingsRows([
            ["conflict_id", conflictId ?? ""],
            ["conflict_name", conflictName],
            ["header", header],
            ["selected_alliance_count", allianceIds.length],
            ["selected_alliance_ids", allianceIds],
        ]);

        const bundle = {
            baseFileName: `conflict-${conflictId ?? "conflict"}-chord`,
            meta: {
                conflictId,
                conflictName,
                header,
                selectedAllianceIds: allianceIds,
                coalitionIds,
            },
            tables: [
                {
                    key: "matrix",
                    label: "Full directed matrix",
                    columns: chordEdgeExportColumns,
                    rows: matrixRows,
                },
                {
                    key: "edges",
                    label: "Edge list (non-zero)",
                    columns: chordEdgeExportColumns,
                    rows: edgeRows,
                },
                {
                    key: "settings",
                    label: "Current filter settings",
                    columns: ["key", "value"],
                    rows: settingsRows,
                },
            ],
        };

        exportBundleData({
            bundle,
            datasetKey: action.datasetKey,
            format: action.format,
            target: action.target,
        });
    }

    function setupChord(
        matrix: number[][],
        alliance_names: string[],
        colors: string[],
        alliance_ids: number[],
        coalition_ids: number[],
    ) {
        const metricMeta = resolveWarWebMetricMeta(_currentHeaderName);
        // clear my_dataviz
        select("#my_dataviz").selectAll("*").remove();

        // create the svg area
        const svg = select("#my_dataviz")
            .append("svg")
            .classed("svg-content-responsive", true)
            .attr("preserveAspectRatio", "xMinYMin meet")
            .attr("viewBox", "0 0 600 600")
            .append("g")
            .attr("transform", "translate(300,300)")
            .classed("rect", true)
            .attr("width", 440)
            .attr("height", 440);

        // give this matrix to d3.chord(): it will calculates all the info we need to draw arc and ribbon
        const res = chordDirected()
            .padAngle(0.01) // padding between entities (black arc)
            .sortSubgroups((left, right) => left - right)
            .sortChords((left, right) => left - right)(matrix);

        // add the groups on the inner part of the circle
        svg.datum(res)
            .append("g")
            .classed("rect", true)
            .attr("width", 440)
            .attr("height", 440)
            .selectAll("g")
            .data((d) => d.groups)
            .join("g")
            .append("path")
            .style("fill", (d, i) => colors[i])
            .style("stroke", "#222")
            .style("stroke-width", "0.25px")
            .attr("d", arc().innerRadius(210).outerRadius(220));

        // Add the links between groups
        let paths = svg
            .datum(res)
            .append("g")
            .selectAll("path")
            .data((d) => d)
            .join("path")
            .attr("d", ribbonArrow().radius(208))
            .attr("fill-opacity", 0.75)
            .attr("stroke-opacity", 0.5)
            // .style("mix-blend-mode", "multiply")
            .style("fill", (d) => colors[d.source.index])
            .style("stroke", (d) => darkenColor(colors[d.source.index], 25))
            .style("stroke-width", "0.5px")
            .style("cursor", "pointer");

        let groups = svg
            .datum(res)
            .append("g")
            .selectAll("g")
            .data((d) => d.groups)
            .join("g")
            .style("cursor", "pointer");

        const allPathNodes: SVGPathElement[] = [];
        const pathNodesByAllianceIndex = new Map<number, SVGPathElement[]>();
        paths.each(function (d: any) {
            const node = this as SVGPathElement;
            allPathNodes.push(node);
            const sourceIndex = d.source.index;
            const targetIndex = d.target.index;
            const addPathNode = (index: number) => {
                const existing = pathNodesByAllianceIndex.get(index);
                if (existing) {
                    existing.push(node);
                } else {
                    pathNodesByAllianceIndex.set(index, [node]);
                }
            };
            addPathNode(sourceIndex);
            if (targetIndex !== sourceIndex) addPathNode(targetIndex);
        });

        groups
            .append("path")
            .style("fill", (d, i) => colors[i])
            .style("stroke", "#222")
            .style("stroke-width", "0.25px")
            .attr("d", arc().innerRadius(210).outerRadius(220));

        groups
            .append("text")
            .each((d) => {
                d.angle = (d.startAngle + d.endAngle) / 2;
            })
            .attr("dy", ".35em")
            .attr(
                "transform",
                (d) => `
        rotate(${(d.angle * 180) / Math.PI - 90})
        translate(${220 + 1})
        ${d.angle > Math.PI ? "rotate(180)" : ""}
    `,
            )
            .attr("text-anchor", (d) => (d.angle > Math.PI ? "end" : null))
            .style("font-size", "9px") // Adjust the font size here
            .text((d, i) => alliance_names[i]);

        let lastShowIndex: number = -1;
        let showIndex: number = -1;
        let activePathNodes: SVGPathElement[] = [];
        let pathFilterActive = false;
        const darkColors = colors.map((color) => darkenColor(color, 50));
        const tooltipRowsByAllianceIndex = matrix.map((row, rowIndex) => {
            const rows: {
                label: string;
                color: string;
                outgoing: number;
                incoming: number;
            }[] = [];
            for (let index = 0; index < row.length; index++) {
                const outgoing = row[index] ?? 0;
                const incoming = matrix[index]?.[rowIndex] ?? 0;
                if (outgoing === 0 && incoming === 0) continue;
                rows.push({
                    label: alliance_names[index],
                    color: darkColors[index],
                    outgoing,
                    incoming,
                });
            }
            rows.sort((left, right) => right.outgoing - left.outgoing);
            return rows;
        });
        const toolTip = document.getElementById("myTooltip") as HTMLElement;
        const tooltipTitle = document.createElement("h5");
        const tooltipNote = document.createElement("div");
        tooltipNote.className = "small text-muted mb-1";
        tooltipNote.textContent = `${metricMeta.directionNote(_currentHeaderName)} Net = Selected value minus Compared value.`;

        const tooltipTable = document.createElement("table");
        tooltipTable.className = "table fw-bold w-auto";
        const tooltipHead = document.createElement("thead");
        const tooltipHeadRow = document.createElement("tr");
        const tooltipHeaders = [
            "Compared alliance",
            metricMeta.primaryToRowLabel(_currentHeaderName),
            metricMeta.rowToPrimaryLabel(_currentHeaderName),
            "Net",
        ];
        for (const headerText of tooltipHeaders) {
            const cell = document.createElement("th");
            cell.textContent = headerText;
            tooltipHeadRow.appendChild(cell);
        }
        tooltipHead.appendChild(tooltipHeadRow);
        const tooltipBody = document.createElement("tbody");
        tooltipTable.append(tooltipHead, tooltipBody);
        toolTip.replaceChildren(tooltipTitle, tooltipNote, tooltipTable);

        const tooltipRowNodes: {
            row: HTMLTableRowElement;
            label: HTMLTableCellElement;
            outgoing: HTMLTableCellElement;
            incoming: HTMLTableCellElement;
            net: HTMLTableCellElement;
        }[] = [];

        function getTooltipRowNode(index: number) {
            let node = tooltipRowNodes[index];
            if (node != null) return node;

            const row = document.createElement("tr");
            const label = document.createElement("td");
            label.style.color = "white";
            const outgoing = document.createElement("td");
            const incoming = document.createElement("td");
            const net = document.createElement("td");
            row.append(label, outgoing, incoming, net);
            tooltipBody.appendChild(row);
            node = { row, label, outgoing, incoming, net };
            tooltipRowNodes[index] = node;
            return node;
        }
        if (
            alliance_ids.filter((id, index) => coalition_ids[index] === 0)
                .length === 1
        ) {
            displayTable(coalition_ids.indexOf(0));
        } else if (
            alliance_ids.filter((id, index) => coalition_ids[index] === 1)
                .length === 1
        ) {
            displayTable(coalition_ids.indexOf(1));
        }

        function displayTable(showIndex: number) {
            const tooltipRows = tooltipRowsByAllianceIndex[showIndex] ?? [];

            tooltipTitle.textContent = `Selected alliance: ${alliance_names[showIndex]} (${_currentHeaderName})`;
            for (let index = 0; index < tooltipRows.length; index += 1) {
                const row = tooltipRows[index];
                const node = getTooltipRowNode(index);
                node.row.style.display = "";
                node.label.style.backgroundColor = row.color;
                node.label.textContent = row.label;
                node.outgoing.textContent = commafy(row.outgoing);
                node.incoming.textContent = commafy(row.incoming);
                node.net.textContent = commafy(row.outgoing - row.incoming);
            }
            for (let index = tooltipRows.length; index < tooltipRowNodes.length; index += 1) {
                const node = tooltipRowNodes[index];
                if (node != null) {
                    node.row.style.display = "none";
                }
            }
        }

        function setPathNodeVisibility(
            nodes: SVGPathElement[],
            isVisible: boolean,
        ) {
            const displayValue = isVisible ? "" : "none";
            for (const node of nodes) {
                node.style.display = displayValue;
            }
        }

        function runShowIndex() {
            if (showIndex !== lastShowIndex) {
                if (showIndex == -1) {
                    if (pathFilterActive) {
                        setPathNodeVisibility(allPathNodes, true);
                        pathFilterActive = false;
                        activePathNodes = [];
                    }
                } else {
                    const nextActiveNodes =
                        pathNodesByAllianceIndex.get(showIndex) ?? [];
                    if (!pathFilterActive) {
                        setPathNodeVisibility(allPathNodes, false);
                        pathFilterActive = true;
                    } else {
                        setPathNodeVisibility(activePathNodes, false);
                    }
                    setPathNodeVisibility(nextActiveNodes, true);
                    activePathNodes = nextActiveNodes;
                    displayTable(showIndex);
                }
                lastShowIndex = showIndex;
            }
        }
        groups.on("click", function (event: MouseEvent, d: any) {
            showIndex = -1;
            lastShowIndex = -1;
            if (pathFilterActive) {
                setPathNodeVisibility(allPathNodes, true);
                pathFilterActive = false;
                activePathNodes = [];
            }
            setLayoutAlliance(coalition_ids[d.index], alliance_ids[d.index]);
        });
        // Attach the tooltip to the groups
        groups
            .on("mouseenter", function (_event: MouseEvent, d: any) {
                showIndex = d.index;
                runShowIndex();
            })
            .on("mouseleave", function () {
                showIndex = -1;
                runShowIndex();
            })
            .on("touchstart", function (_event: TouchEvent, d: any) {
                showIndex = d.index;
                runShowIndex();
            })
            .on("touchend", function () {
                showIndex = -1;
                runShowIndex();
            });

        paths
            .on("mouseenter", function (_event: MouseEvent, d: any) {
                showIndex = d.source.index;
                runShowIndex();
            })
            .on("mouseleave", function () {
                showIndex = -1;
                runShowIndex();
            })
            .on("touchstart", function (_event: TouchEvent, d: any) {
                showIndex = d.source.index;
                runShowIndex();
            })
            .on("touchend", function () {
                showIndex = -1;
                runShowIndex();
            });
    }
</script>

<svelte:head>
    <link rel="preconnect" href={config.data_origin} crossorigin="anonymous" />
    <!-- <script src="https://d3js.org/d3.v6.js"></script> -->
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
                    { label: "Chord" },
                ]}
            />
            <span class="ux-page-title-main">Conflict: {conflictName}</span>
        </div>
        {#if _rawData?.wiki}
            <a
                class="btn ux-btn fw-bold"
                href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}"
                >Wiki:{_rawData?.wiki}<Icon
                    name="externalLink"
                    className="ux-icon-inline"
                /></a
            >
        {/if}
    </h1>
    <ConflictRouteTabs {conflictId} active="chord" routeKind="single" />
    <div class="ux-surface ux-tab-panel p-2 ux-compact-controls" style="min-height: 116px;">
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
        {#if _rawData}
            <div class="d-flex justify-content-between align-items-center mb-1">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-bold"
                        >Metric header: {_currentHeaderName}</span
                    >
                    <SelectionModal
                        title="Choose Metric Header"
                        description="Pick the active header used to generate chord edges and flow tables."
                        items={headerModalItems}
                        selectedIds={[_currentHeaderName]}
                        applyLabel="Use header"
                        singleSelect={true}
                        searchPlaceholder="Search layouts..."
                        buttonLabel="Choose metric header"
                        size="sm"
                        on:apply={applyHeaderModal}
                        validateSelection={(ids) => validateSingleSelection(ids, "header")}
                    />
                    <form
                        class="input-group input-group-sm ux-inputbar chord-top-selection-group"
                        on:submit|preventDefault={selectTopAlliancesForCurrentHeader}
                    >
                        <label
                            class="input-group-text"
                            for="chord-top-alliance-count">Top</label
                        >
                        <input
                            id="chord-top-alliance-count"
                            class="form-control form-control-sm chord-top-selection-input"
                            type="number"
                            min="1"
                            step="1"
                            bind:value={topAllianceCountInput}
                            aria-label="Top alliances to select per coalition"
                        />
                        <button class="btn ux-btn btn-sm" type="submit">
                            Select Top Alliances
                        </button>
                    </form>
                </div>
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <ExportDataMenu
                        datasets={chordExportDatasets}
                        bind:selectedDatasetKey={selectedChordExportDataset}
                        onExport={handleChordExport}
                    />
                    <ShareResetBar
                        onReset={resetFilters}
                        resetDirty={isResetDirty}
                    />
                </div>
            </div>
            <hr class="m-1" />
            <div
                class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--red"
            >
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-bold">
                        {_rawData?.coalitions[0].name} selected: {_rawData.coalitions[0].alliance_ids.filter(
                            (id) => _allowedAllianceIds.has(id),
                        ).length}/{_rawData.coalitions[0].alliance_ids.length}
                    </span>
                </div>
                <div class="mt-2">
                    <AllianceFilterModal
                        title={`Filter Alliances: ${_rawData?.coalitions[0]?.name ?? "Coalition"}`}
                        description="Select alliances for the coalition associated with the button you clicked."
                        coalitions={_rawData.coalitions}
                        selectedIds={Array.from(_allowedAllianceIds)}
                        mode="coalition-merged"
                        coalitionIndex={0}
                        buttonLabel="Edit alliances"
                        size="sm"
                        on:commit={(event) => commitAllowedAllianceIds(event.detail.ids)}
                    />
                </div>
            </div>
            <div
                class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--blue"
            >
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-bold">
                        {_rawData?.coalitions[1].name} selected: {_rawData.coalitions[1].alliance_ids.filter(
                            (id) => _allowedAllianceIds.has(id),
                        ).length}/{_rawData.coalitions[1].alliance_ids.length}
                    </span>
                </div>
                <div class="mt-2">
                    <AllianceFilterModal
                        title={`Filter Alliances: ${_rawData?.coalitions[1]?.name ?? "Coalition"}`}
                        description="Select alliances for the coalition associated with the button you clicked."
                        coalitions={_rawData.coalitions}
                        selectedIds={Array.from(_allowedAllianceIds)}
                        mode="coalition-merged"
                        coalitionIndex={1}
                        buttonLabel="Edit alliances"
                        size="sm"
                        on:commit={(event) => commitAllowedAllianceIds(event.detail.ids)}
                    />
                </div>
            </div>
            <div class="small text-muted mt-2">
                {resolveWarWebMetricMeta(_currentHeaderName).directionNote(
                    _currentHeaderName,
                )}
                Hover an alliance arc or any chord to inspect one Selected alliance versus Compared alliances.
                "Net" = Selected value minus Compared value.
            </div>
        {/if}
    </div>
    <div class="container bg-light-subtle">
        <div id="my_dataviz"></div>
        <div class="mt-1" id="myTooltip" style="min-height:15em"></div>
    </div>
    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}
    <br />
</div>

<style>
    .chord-top-selection-group {
        width: auto;
        margin: 0;
        flex: 0 0 auto;
    }

    .chord-top-selection-input {
        flex: 0 0 3.3rem;
        width: 3.3rem;
        text-align: end;
    }
</style>
