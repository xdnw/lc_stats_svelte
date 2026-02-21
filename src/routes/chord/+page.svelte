<script lang="ts">
    // @ts-nocheck
    import {
        decompressBson,
        type Conflict,
        rafDelay,
        getCurrentQueryParams,
        setQueryParam,
        generateColorsFromPalettes,
        Palette,
        darkenColor,
        commafy,
        toggleCoalitionAllianceSelection,
        getConflictDataUrl,
        getConflictGraphDataUrl,
        applySavedQueryParamsIfMissing,
        saveCurrentQueryParams,
        resetQueryParams,
        formatDatasetProvenance,
        formatAllianceName,
        getDefaultWarWebHeader,
        resolveWarWebMetricMeta,
    } from "$lib";
    import { onMount } from "svelte";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import Breadcrumbs from "../../components/Breadcrumbs.svelte";
    import * as d3 from "d3";
    import { config } from "../+layout";

    let conflictName = "";
    let conflictId: string | null = null;

    let _rawData: Conflict | null = null;
    let _allowedAllianceIds: Set<number> = new Set();
    let _currentHeaderName: string = "wars";
    let _loaded = false;
    let _loadError: string | null = null;
    let datasetProvenance = "";
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
        applySavedQueryParamsIfMissing(["header", "ids"], ["id"]);
        let queryParams = getCurrentQueryParams();
        const id = queryParams.get("id");
        if (id) {
            conflictId = id;
            setupWebFromId(conflictId, queryParams);
        } else {
            _loadError = "Missing conflict id in URL";
            _loaded = true;
        }
    });

    function setupWebFromId(conflictId: string, queryParams: URLSearchParams) {
        _loadError = null;
        _loaded = false;
        let url = getConflictDataUrl(conflictId, config.version.conflict_data);
        decompressBson(url)
            .then((data) => {
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
                setupWebWithCurrentLayout();
                _loaded = true;
                saveCurrentQueryParams();

                // Warm graph payload cache so switching to Tiering/Bubble is faster.
                const schedulePrefetch =
                    typeof (window as any).requestIdleCallback === "function"
                        ? (cb: () => void) =>
                              (window as any).requestIdleCallback(cb, {
                                  timeout: 2500,
                              })
                        : (cb: () => void) => window.setTimeout(cb, 300);
                schedulePrefetch(() => {
                    const graphUrl = getConflictGraphDataUrl(
                        conflictId,
                        config.version.graph_data,
                    );
                    decompressBson(graphUrl).catch(() => {
                        // Best-effort prefetch only.
                    });
                });
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

    function resetFilters() {
        if (!_rawData) return;
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
        // let allowedAllianceIds: number[] = [...data.coalitions[0].alliance_ids, 11657];

        let allianceNameById: { [key: number]: string } = {};
        data.coalitions.forEach((coalition) => {
            coalition.alliance_ids.forEach((id: number, index: number) => {
                allianceNameById[id] = formatAllianceName(
                    coalition.alliance_names[index],
                    id,
                );
            });
        });
        let allPalette: number[] = [];
        let labels: string[] = [];
        let allAllianceIds = [
            ...data.coalitions[0].alliance_ids,
            ...data.coalitions[1].alliance_ids,
        ];
        let alliance_ids = allAllianceIds.filter((id) =>
            allowedAllianceIdsSet.has(id),
        );
        let coalition_ids = [];
        for (let aaId of data.coalitions[0].alliance_ids) {
            allPalette.push(Palette.REDS);
            if (allowedAllianceIdsSet.has(aaId)) {
                labels.push(allianceNameById[aaId]);
                coalition_ids.push(0);
            }
        }
        for (let aaId of data.coalitions[1].alliance_ids) {
            allPalette.push(Palette.BLUES);
            if (allowedAllianceIdsSet.has(aaId)) {
                labels.push(allianceNameById[aaId]);
                coalition_ids.push(1);
            }
        }
        let allColors = generateColorsFromPalettes(d3, allPalette);
        let colors = allColors.filter((value, index) =>
            allowedAllianceIdsSet.has(allAllianceIds[index]),
        );

        let headers = data.war_web.headers;
        let hI = headers.indexOf(header);

        let allMatrix = data.war_web.data[hI];
        let matrix: number[][] = [];

        for (let i = 0; i < allAllianceIds.length; i++) {
            let aaId = allAllianceIds[i];
            let row = allMatrix[i];
            if (allowedAllianceIdsSet.has(aaId)) {
                let rowSlice = row.filter((value, index) =>
                    allowedAllianceIdsSet.has(allAllianceIds[index]),
                );
                matrix.push(rowSlice);
            }
        }
        matrix = matrix.map((row) =>
            row.length === 0 ? new Array(labels.length).fill(0) : row,
        );
        matrix = matrix.map((row) =>
            row.map((value) => (isNaN(value) || value < 0 ? 0 : value)),
        );
        setupChord(matrix, labels, colors, alliance_ids, coalition_ids);
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
        d3.select("#my_dataviz").selectAll("*").remove();

        // create the svg area
        const svg = d3
            .select("#my_dataviz")
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
        const res = d3
            .chordDirected()
            .padAngle(0.01) // padding between entities (black arc)
            .sortSubgroups(d3.ascending)
            .sortChords(d3.ascending)(matrix);

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
            .attr("d", d3.arc().innerRadius(210).outerRadius(220));

        // Add the links between groups
        let paths = svg
            .datum(res)
            .append("g")
            .selectAll("path")
            .data((d) => d)
            .join("path")
            .attr("d", d3.ribbonArrow().radius(208))
            .attr("fill-opacity", 0.75)
            .attr("stroke-opacity", 0.5)
            // .style("mix-blend-mode", "multiply")
            .style("fill", (d) => colors[d.source.index])
            .style("stroke", (d) => darkenColor(colors[d.source.index], 25))
            .style("stroke-width", "0.5px");

        let groups = svg
            .datum(res)
            .append("g")
            .selectAll("g")
            .data((d) => d.groups)
            .join("g");

        groups
            .append("path")
            .style("fill", (d, i) => colors[i])
            .style("stroke", "#222")
            .style("stroke-width", "0.25px")
            .attr("d", d3.arc().innerRadius(210).outerRadius(220));

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
            let toolTip = document.getElementById("myTooltip") as HTMLElement;
            // where value is not 0 (of either matrix[showIndex][index] or matrix[index][showIndex])
            let allowedIndexes = new Set(
                matrix[showIndex]
                    .map((value, index) =>
                        value !== 0 || matrix[index][showIndex] !== 0
                            ? index
                            : -1,
                    )
                    .filter((index) => index !== -1),
            );
            let labels = alliance_names.filter((value, index) =>
                allowedIndexes.has(index),
            );
            let colorSlice = colors.filter((value, index) =>
                allowedIndexes.has(index),
            );
            let data = matrix[showIndex].filter((value, index) =>
                allowedIndexes.has(index),
            );
            let secondArray = matrix
                .map((row, index) =>
                    allowedIndexes.has(index) ? row[showIndex] : null,
                )
                .filter((item) => item !== null);
            // sort them
            let indices = Array.from({ length: data.length }, (_, i) => i);
            indices.sort((a, b) => data[b] - data[a]);
            // Use the sorted indices to sort the labels, colorSlice, data, and secondArray arrays
            labels = indices.map((i) => labels[i]);
            colorSlice = indices.map((i) => colorSlice[i]);
            data = indices.map((i) => data[i]);
            secondArray = indices.map((i) => secondArray[i]);

            let table = `<h5>Selected alliance: ${alliance_names[showIndex]} (${_currentHeaderName})</h5><div class='small text-muted mb-1'>${metricMeta.directionNote(_currentHeaderName)} Net = Selected value minus Compared value.</div><table class='table fw-bold w-auto'><tr><th>Compared alliance</th><th>${metricMeta.primaryToRowLabel(_currentHeaderName)}</th><th>${metricMeta.rowToPrimaryLabel(_currentHeaderName)}</th><th>Net</th></tr>`;
            labels.forEach((label, index) => {
                table += `<tr><td style='background-color:${darkenColor(colorSlice[index], 50)};color:white'>${label}</td>`;
                table += `<td>${commafy(data[index])}</td>`;
                table += `<td>${commafy(secondArray[index])}</td>`;
                table += `<td>${commafy(data[index] - secondArray[index])}</td></tr>`;
            });
            table += "</table>";
            toolTip.innerHTML = table;
        }

        function runShowIndex() {
            if (showIndex !== lastShowIndex) {
                if (showIndex == -1) {
                    paths.classed("d-none", false);
                } else {
                    paths
                        .filter(
                            (p) =>
                                p.source.index !== showIndex &&
                                p.target.index !== showIndex,
                        )
                        .classed("d-none", true);
                    paths
                        .filter(
                            (p) =>
                                p.source.index === showIndex ||
                                p.target.index === showIndex,
                        )
                        .classed("d-none", false);
                    displayTable(showIndex);
                }
                lastShowIndex = showIndex;
            }
        }
        groups.on("click", function (event: MouseEvent, d: any) {
            showIndex = -1;
            lastShowIndex = -1;
            setLayoutAlliance(coalition_ids[d.index], alliance_ids[d.index]);
        });
        // Attach the tooltip to the groups
        groups
            .on("mouseover", function (event: MouseEvent, d: any) {
                showIndex = d.index;
                requestAnimationFrame(rafDelay(100, runShowIndex));
            })
            .on("mouseout", function (event: MouseEvent, d: any) {
                showIndex = -1;
                requestAnimationFrame(rafDelay(100, runShowIndex));
            })
            .on("mouseover touchstart", function (event: MouseEvent, d: any) {
                showIndex = d.index;
                requestAnimationFrame(rafDelay(100, runShowIndex));
            })
            .on(
                "mouseout touchend",
                function (event: MouseEvent | TouchEvent, d: any) {
                    showIndex = -1;
                    requestAnimationFrame(rafDelay(100, runShowIndex));
                },
            );
    }
</script>

<svelte:head>
    <!-- <script src="https://d3js.org/d3.v6.js"></script> -->
</svelte:head>
<div class="container-fluid p-2 ux-page-body">
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <div class="ux-page-title-stack">
            <Breadcrumbs
                items={[
                    { label: "Home", href: "/" },
                    { label: "Conflicts", href: "/conflicts" },
                    {
                        label: conflictName || "Conflict",
                        href: conflictId
                            ? "/conflict?id=" + conflictId
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
                >Wiki:{_rawData?.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"
                ></i></a
            >
        {/if}
    </h1>
    <ConflictRouteTabs {conflictId} active="chord" />
    <div class="ux-surface ux-tab-panel p-2 fw-bold" style="min-height: 116px;">
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
                <span class="fw-bold">Layout Picker:</span>
                <ShareResetBar
                    onReset={resetFilters}
                    resetDirty={isResetDirty}
                />
            </div>
            {#each _rawData.war_web.headers as header (header)}
                <button
                    class="btn ux-btn btn-sm ms-1 mb-1 fw-bold"
                    class:active={_currentHeaderName === header}
                    on:click={() => setLayoutHeader(header)}>{header}</button
                >
            {/each}
            <hr class="m-1" />
            <div
                class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--red"
            >
                {_rawData?.coalitions[0].name}:
                {#each _rawData.coalitions[0].alliance_ids as id, index}
                    <button
                        class="btn ux-btn btn-sm ms-1 mb-1 fw-bold"
                        class:active={_allowedAllianceIds.has(id)}
                        on:click={() => setLayoutAlliance(0, id)}
                        >{formatAllianceName(
                            _rawData.coalitions[0].alliance_names[index],
                            id,
                        )}</button
                    >
                {/each}
            </div>
            <div
                class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--blue"
            >
                {_rawData?.coalitions[1].name}:
                {#each _rawData.coalitions[1].alliance_ids as id, index}
                    <button
                        class="btn ux-btn btn-sm ms-1 mb-1 fw-bold"
                        class:active={_allowedAllianceIds.has(id)}
                        on:click={() => setLayoutAlliance(1, id)}
                        >{formatAllianceName(
                            _rawData.coalitions[1].alliance_names[index],
                            id,
                        )}</button
                    >
                {/each}
            </div>
            <div class="small text-muted mt-2">
                {resolveWarWebMetricMeta(_currentHeaderName).directionNote(
                    _currentHeaderName,
                )}
                Hover a chord to inspect one Selected alliance versus Compared alliances.
                "Net" = Selected value minus Compared value.
            </div>
        {/if}
    </div>
    <div class="d-flex justify-content-center align-items-center mt-1">
        <div
            class="d-flex justify-content-center align-items-center alert alert-danger text-center mb-1 py-1 text-danger"
        >
            Click or hover over one of the chords and then scroll down to view
            the table.
        </div>
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
