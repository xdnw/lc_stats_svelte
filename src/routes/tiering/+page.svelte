<script lang="ts">
    /**
     * This page is for viewing tiering charts for a conflict
     */
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import type { API, Options } from "nouislider";
    import { Chart, registerables, type ChartConfiguration } from "chart.js";
    Chart.register(...registerables);
    import { onMount, tick } from "svelte";
    import {
        decompressBson,
        formatTurnsToDate,
        type GraphData,
        type TierMetric,
        arrayEquals,
        setQueryParam,
        getCurrentQueryParams,
        resolveMetricAccessors,
        toggleCoalitionAllianceSelection,
        getConflictGraphDataUrl,
        formatDaysToDate,
        Palette,
        palettePrimary,
        generateColors,
        applySavedQueryParamsIfMissing,
        saveCurrentQueryParams,
        resetQueryParams,
        formatDatasetProvenance,
        formatAllianceName,
    } from "$lib";
    import { config } from "../+layout";
    import Select from "svelte-select";
    import * as d3 from "d3";
    import noUiSlider from "nouislider";

    let _loaded = false;
    let _loadError: string | null = null;
    let conflictName = "";
    let conflictId: string | null = null;
    let datasetProvenance = "";

    let normalize: boolean = false;
    let previous_normalize: boolean = false;

    let useSingleColor: boolean = false;
    let previous_useSingleColor: boolean = false;

    let sliderElement: HTMLDivElement;
    let turnValues: number[];

    function getSliderApi(): any {
        return (sliderElement as any)?.noUiSlider;
    }

    let _allowedAllianceIds: Set<number> = new Set();

    let dataSets: DataSet[];

    /**
     * The raw data for the conflict, uninitialized until setupChartData is called
     */
    let _rawData: GraphData;
    const defaultMetricSelection = ["nation"];
    let selected_metrics: { value: string; label: string }[] =
        defaultMetricSelection.map((name) => {
            return { value: name, label: name };
        });
    $: isResetDirty = (() => {
        const selectedValues = selected_metrics.map((metric) => metric.value);
        const sameSelected =
            selectedValues.length === defaultMetricSelection.length &&
            selectedValues.every(
                (value, idx) => value === defaultMetricSelection[idx],
            );
        const allAllianceCount = _rawData
            ? _rawData.coalitions[0].alliance_ids.length +
              _rawData.coalitions[1].alliance_ids.length
            : 0;
        const allSelected =
            !_rawData || _allowedAllianceIds.size === allAllianceCount;
        return normalize || useSingleColor || !sameSelected || !allSelected;
    })();

    $: maxItems = selected_metrics?.length === 4;
    $: items =
        maxItems || !_rawData
            ? []
            : [
                  ..._rawData.metric_names.map((name) => {
                      return { value: name, label: name };
                  }),
              ];
    $: {
        if (selected_metrics) {
            handleMetricsChange();
        }
    }
    let previous_selected: { value: string; label: string }[] = [];
    function handleMetricsChange() {
        if (arrayEquals(previous_selected, selected_metrics)) return;
        maxItems = selected_metrics?.length === 4;
        previous_selected = selected_metrics.slice();
        if (_rawData && selected_metrics.length > 0) {
            setQueryParam(
                "selected",
                selected_metrics.map((metric) => metric.value).join("."),
            );
            saveCurrentQueryParams();
            setupCharts(_rawData);
        }
    }

    async function handlePercentCheck(): Promise<boolean> {
        await tick();
        if (previous_normalize == normalize) return false;
        previous_normalize = normalize;
        if (_rawData) {
            setQueryParam("normalize", normalize ? 1 : null, { replace: true });
            saveCurrentQueryParams();
            setupCharts(_rawData);
        }
        return true;
    }

    async function handleColorCheck(): Promise<boolean> {
        await tick();
        if (previous_useSingleColor == useSingleColor) return false;
        previous_useSingleColor = useSingleColor;
        if (_rawData) {
            setQueryParam("unicolor", useSingleColor ? 1 : null, {
                replace: true,
            });
            saveCurrentQueryParams();
            setupCharts(_rawData);
        }
        return true;
    }

    function setLayoutAlliance(coalitionIndex: number, allianceId: number) {
        if (!_rawData) return;
        _allowedAllianceIds = toggleCoalitionAllianceSelection(
            _allowedAllianceIds,
            _rawData.coalitions,
            coalitionIndex,
            allianceId,
        );
        if (_rawData) {
            setQueryParam("ids", Array.from(_allowedAllianceIds).join("."), {
                replace: true,
            });
            saveCurrentQueryParams();
            setupCharts(_rawData);
        }
    }

    function loadQueryParams(params: URLSearchParams) {
        let selected = params.get("selected");
        if (selected) {
            selected_metrics = selected.split(".").map((name) => {
                return { value: name, label: name };
            });
        }
        previous_selected = selected_metrics.slice();
        maxItems = selected_metrics?.length === 4;
        let normalizeStr = params.get("normalize");
        if (normalizeStr && !isNaN(+normalizeStr)) {
            normalize = +normalizeStr == 1;
        }
        let unicolorStr = params.get("unicolor");
        if (unicolorStr && !isNaN(+unicolorStr)) {
            useSingleColor = +unicolorStr == 1;
        }
    }

    // onMount runs when this component (i.e. the page) is loaded
    // This gets the conflict id from the url query string, fetches the data from s3 and creates the charts
    onMount(() => {
        applySavedQueryParamsIfMissing(
            ["selected", "normalize", "unicolor", "ids"],
            ["id"],
        );
        // Get the conflict id from the url query string
        let queryParams = getCurrentQueryParams();
        loadQueryParams(queryParams);

        const id = queryParams.get("id");
        if (id) {
            conflictId = id;
            setupChartData(conflictId);
        } else {
            _loadError = "Missing conflict id in URL";
            _loaded = true;
        }
    });

    /**
     * Fetches data for a conflict
     * Sets the conflict name
     * Add the charts to the container div and set their data/settings
     * @param conflictId The id of the conflict
     */
    function setupChartData(conflictId: string) {
        _loadError = null;
        _loaded = false;
        let url = getConflictGraphDataUrl(
            conflictId,
            config.version.graph_data,
        );
        decompressBson(url)
            .then((data) => {
                _rawData = data;
                conflictName = _rawData.name;
                datasetProvenance = formatDatasetProvenance(
                    config.version.graph_data,
                    (data as any).update_ms,
                );
                setupCharts(_rawData);
                _loaded = true;
                saveCurrentQueryParams();
            })
            .catch((error) => {
                console.error("Failed to load tiering graph data", error);
                _loadError =
                    "Could not load conflict graph data. Please try again later.";
                _loaded = true;
            });
    }

    function retryLoad() {
        if (!conflictId) return;
        setupChartData(conflictId);
    }

    // The layout of the charts (the key is id of the html element that'll be created)
    // Multiple metrics will display as a stacked bar chart (between two coalitions)
    // Its assumed the metrics are in the same units, otherwise the normalization will be incorrect
    // Normalization = Average it per city (i.e. for soldier %)
    let _chartLayouts: {
        [key: string]: {
            metrics: string[];
            normalize: boolean;
        };
    } = {
        tiering: {
            metrics: ["nation"],
            normalize: false,
        },
        mmr: {
            metrics: ["soldier", "tank", "aircraft", "ship"],
            normalize: true,
        },
        "air %": {
            metrics: ["aircraft"],
            normalize: true,
        },
        "avg infra": {
            metrics: ["infra"],
            normalize: true,
        },
        damage: {
            metrics: ["loss:loss_value", "dealt:loss_value"],
            normalize: true,
        },
        "wars won": {
            metrics: ["off:wars_won", "def:wars_won"],
            normalize: false,
        },
    };

    function setLayout(name: string) {
        let layout = _chartLayouts[name];
        if (layout && _rawData) {
            selected_metrics = layout.metrics.map((name) => {
                return { value: name, label: name };
            });
            normalize = layout.normalize;
            previous_normalize = normalize;
            setQueryParam(
                "selected",
                selected_metrics.map((metric) => metric.value).join("."),
            );
            setQueryParam("normalize", normalize ? 1 : null);
            saveCurrentQueryParams();
            setupCharts(_rawData);
        }
    }

    function resetFilters() {
        normalize = false;
        previous_normalize = false;
        useSingleColor = false;
        previous_useSingleColor = false;
        selected_metrics = ["nation"].map((name) => ({
            value: name,
            label: name,
        }));
        previous_selected = selected_metrics.slice();
        _allowedAllianceIds = new Set();
        resetQueryParams(["selected", "normalize", "unicolor", "ids"], ["id"]);
        saveCurrentQueryParams();
        if (_rawData) {
            setupCharts(_rawData);
        }
    }

    function getGraphDataAtTime(
        data: DataSet[],
        slider: number[],
    ): {
        label: string;
        data: number[];
        backgroundColor: string;
        stack: string;
    }[] {
        if (slider[0] == 0 && slider.length == 2) {
            slider = [slider[1]];
        }
        if (slider.length == 1) {
            return data.map((dataSet) => ({
                label: dataSet.label,
                data: dataSet.data[slider[0]],
                backgroundColor: dataSet.color,
                stack: "" + dataSet.group,
            }));
        } else {
            return data.map((dataSet) => {
                let data = dataSet.data[slider[1]].map(
                    (value, j) => value - (dataSet.data[slider[0]][j] | 0),
                );
                return {
                    label: dataSet.label,
                    data: data,
                    backgroundColor: dataSet.color,
                    stack: "" + dataSet.group,
                };
            });
        }
    }

    function setupCharts(data: GraphData) {
        if (!data) return;
        // if selected_metrics is empty, set to default
        if (selected_metrics.length == 0) {
            selected_metrics = ["dealt:loss_value"].map((name) => {
                return { value: name, label: name };
            });
        }
        let metrics: TierMetric[] = selected_metrics.map((metric) => {
            return {
                name: metric.value,
                normalize: normalize,
                cumulative: metric.value.includes(":"),
            };
        });
        let isAnyCumulative = metrics.reduce(
            (a, b) => a || b.cumulative,
            false,
        );
        if (_allowedAllianceIds.size == 0) {
            _allowedAllianceIds = new Set(
                data.coalitions[0].alliance_ids.concat(
                    data.coalitions[1].alliance_ids,
                ),
            );
        }
        let alliance_ids = data.coalitions.map((coalition) =>
            coalition.alliance_ids.filter((id) => _allowedAllianceIds.has(id)),
        );

        let response = getDataSetsByTime(_rawData, metrics, alliance_ids);
        if (!response) return;

        turnValues = isAnyCumulative ? response.time : [response.time[0]];
        dataSets = response.data;

        let trace: {
            label: string;
            data: number[];
            backgroundColor: string;
            stack: string;
        }[] = getGraphDataAtTime(
            dataSets,
            isAnyCumulative ? [0, response.time[1] - response.time[0]] : [0],
        );

        let minCity = response.city_range[0];
        let maxCity = response.city_range[1];
        let labels = Array.from(
            { length: maxCity - minCity + 1 },
            (_, i) => i + minCity,
        );
        const chartData = {
            labels: labels,
            datasets: trace,
        };

        let title =
            selected_metrics.map((metric) => metric.label).join(" / ") +
            " by City";
        const chartConfig: ChartConfiguration = {
            type: "bar",
            data: chartData,
            options: {
                maintainAspectRatio: false,
                animation: {
                    duration: 0,
                },
                plugins: {
                    title: {
                        display: true,
                        text: title,
                    },
                },
                responsive: true,
                interaction: {
                    intersect: false,
                },
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        stacked: true,
                    },
                },
            },
        };
        const chartElem = document.getElementById(
            "myChart",
        ) as HTMLCanvasElement;
        let chartInstance = Chart.getChart(chartElem);
        if (chartInstance) {
            chartInstance.destroy();
        }
        new Chart(chartElem, chartConfig);

        let format = response.is_turn ? formatTurnsToDate : formatDaysToDate;
        let density = response.is_turn ? 60 : 5;
        let config: Options = {
            start: turnValues,
            connect: true,
            step: 1,
            tooltips: isAnyCumulative
                ? [
                      { to: (value) => format(value) },
                      { to: (value) => format(value) },
                  ]
                : [{ to: (value) => format(value) }],
            range: {
                min: response.time[0],
                max: response.time[1],
            },
            pips: {
                mode: "steps" as any,
                density: density,
                format: {
                    to: (value) => format(value),
                },
                filter: (value, _type) => {
                    return value % density ? 0 : 2;
                },
            },
        };
        let sliderOrNull: API = getSliderApi();
        if (sliderOrNull) {
            sliderOrNull.destroy();
        }
        noUiSlider.create(sliderElement, config);

        getSliderApi()?.on("set", (values: string[]) => {
            let myChart = Chart.getChart(chartElem);
            if (!myChart) return;
            const sliderApi = getSliderApi();
            let stepSize = sliderApi.options.step || 1;
            let minValue = Number(sliderApi.options.range.min);
            let indices = values.map((value) =>
                Math.round((Number(value) - minValue) / stepSize),
            );
            let trace = getGraphDataAtTime(dataSets, indices);
            myChart.data.datasets.forEach((dataset, i) => {
                dataset.data = trace[i].data;
            });
            myChart.update();
        });
    }

    interface DataSet {
        group: number;
        label: string;
        color: string;
        data: number[][];
    }

    // Convert the raw json data from S3 to a Chart.js dataset (for the specific metrics and turn/day range)
    // Normalization will divide by the number of units per city (see UNITS_PER_CITY)
    function getDataSetsByTime(
        data: GraphData,
        metrics: TierMetric[],
        alliance_ids: number[][],
    ): {
        data: DataSet[];
        city_range: [number, number];
        time: [number, number];
        is_turn: boolean;
    } | null {
        let minCity = Number.MAX_SAFE_INTEGER;
        let maxCity = 0;
        for (let i = 0; i < data.coalitions.length; i++) {
            let coalition = data.coalitions[i];
            minCity = Math.min(minCity, ...coalition.cities);
            maxCity = Math.max(maxCity, ...coalition.cities);
        }

        let normalizeAny = metrics.reduce((a, b) => a || b.normalize, false);
        let stackByAlliance = !normalizeAny && metrics.length == 1;
        const metricAccessors = resolveMetricAccessors(data, metrics);
        if (!metricAccessors) return null;

        let metric_indexes = metricAccessors.metric_indexes;
        let metric_is_turn = metricAccessors.metric_is_turn;
        let metric_normalize = metricAccessors.metric_normalize;
        let isAnyTurn = metricAccessors.isAnyTurn;
        let len =
            metrics.length == 1
                ? alliance_ids.length
                : data.coalitions.length * metrics.length;
        let allianceSets: Set<number>[] = alliance_ids.map((id) => new Set(id));

        let dataBeforeNormalize: [
            number, // coalition
            string, // label
            string, // color
            number[][], // data
            number[][] | null, // counts (or null, if not normalize)
        ][] = new Array(len);

        let time_min = isAnyTurn
            ? data.coalitions.reduce(
                  (a, b) => Math.min(a, b.turn.range[0]),
                  Number.MAX_SAFE_INTEGER,
              )
            : data.coalitions.reduce(
                  (a, b) => Math.min(a, b.day.range[0]),
                  Number.MAX_SAFE_INTEGER,
              );
        let time_max = isAnyTurn
            ? data.coalitions.reduce((a, b) => Math.max(a, b.turn.range[1]), 0)
            : data.coalitions.reduce((a, b) => Math.max(a, b.day.range[1]), 0);
        let dataSetTimeLen = time_max - time_min + 1;

        let jUsed = 0;
        for (let i = 0; i < data.coalitions.length; i++) {
            let coalition = data.coalitions[i];
            let allowed_alliances = allianceSets[i];

            let turn_start = coalition.turn.range[0];
            let day_start = coalition.day.range[0];
            let col_time_min = isAnyTurn ? turn_start : day_start;
            let col_time_max = isAnyTurn
                ? coalition.turn.range[1]
                : coalition.day.range[1];
            let numAlliances = coalition.alliance_ids.reduce(
                (count, id) => (allowed_alliances.has(id) ? count + 1 : count),
                0,
            );
            let palette: Palette = Object.keys(Palette).map(Number).indexOf(i);
            let colorLen = useSingleColor
                ? 1
                : stackByAlliance
                  ? numAlliances
                  : metrics.length;
            let colors =
                colorLen > 1
                    ? generateColors(d3, colorLen, palette)
                    : ["rgb(" + palettePrimary[i] + ")"];
            let colorIndex = 0;
            for (let j = 0; j < coalition.alliance_ids.length; j++) {
                let alliance_id = coalition.alliance_ids[j];
                if (!allowed_alliances.has(alliance_id)) continue;
                let name = formatAllianceName(
                    coalition.alliance_names[j],
                    alliance_id,
                );

                // metric -> city
                let aaBufferByMetric: number[][] = new Array(metrics.length);
                let countsBuffer: number[] = new Array(
                    maxCity - minCity + 1,
                ).fill(0);
                let updatedCounts = false;

                let last_day = -1;
                for (
                    let turnOrDay2 = col_time_min;
                    turnOrDay2 <= col_time_max;
                    turnOrDay2++
                ) {
                    updatedCounts = false;
                    let dataI = turnOrDay2 - time_min;
                    let dataColI = turnOrDay2 - col_time_min;
                    let turnI = isAnyTurn ? dataColI : dataColI * 12;
                    let dayI = isAnyTurn ? Math.floor(dataColI / 12) : dataColI;

                    for (let k = 0; k < metrics.length; k++) {
                        let dataSetIndex = jUsed * metrics.length + k;
                        let is_turn = metric_is_turn[k];
                        if (!is_turn && last_day == dayI) continue;
                        let metricI = is_turn ? turnI : dayI;
                        let isCumulative = metrics[k].cumulative;

                        let aaBuffer = aaBufferByMetric[k];
                        if (!aaBuffer) {
                            aaBuffer = aaBufferByMetric[k] = new Array(
                                maxCity - minCity + 1,
                            ).fill(0);
                        }

                        let dataSet = dataBeforeNormalize[dataSetIndex];
                        if (!dataSet) {
                            dataSet = dataBeforeNormalize[dataSetIndex] = [
                                i,
                                (stackByAlliance ? name : coalition.name) +
                                    (metrics.length > 1
                                        ? "(" + metrics[k].name + ")"
                                        : ""),
                                colors[useSingleColor ? 0 : colorIndex + k],
                                new Array(dataSetTimeLen),
                                normalizeAny ? new Array(dataSetTimeLen) : null,
                            ];
                        }
                        let tierData = dataSet[3][dataI];
                        if (!tierData) {
                            tierData = dataSet[3][dataI] = new Array(
                                maxCity - minCity + 1,
                            ).fill(0);
                        }
                        let counts: number[] | null = null;
                        if (normalizeAny) {
                            const countsByTime = dataSet[4];
                            if (countsByTime) {
                                counts = countsByTime[dataI];
                                if (!counts) {
                                    counts = countsByTime[dataI] = new Array(
                                        maxCity - minCity + 1,
                                    ).fill(0);
                                }
                            }
                        }
                        let normalize = metric_normalize[k];
                        if (normalize != -1) {
                            if (!counts) {
                                continue;
                            }
                            let nation_counts_by_day = coalition.day.data[0][j];
                            if (!nation_counts_by_day) {
                                continue;
                            }
                            let nation_counts = nation_counts_by_day[dayI];
                            if (nation_counts && !updatedCounts) {
                                // updatedCounts = true;
                                for (let l = 0; l < nation_counts.length; l++) {
                                    let value = nation_counts[l];
                                    let city = coalition.cities[l];
                                    if (value != null) {
                                        countsBuffer[city - minCity] = value;
                                    }
                                }
                            }
                            if (normalize == 0) {
                                for (let l = 0; l < countsBuffer.length; l++) {
                                    let city = coalition.cities[l];
                                    let value = countsBuffer[l];
                                    if (value != null) {
                                        counts[city - minCity] += value;
                                    }
                                }
                            } else {
                                for (let l = 0; l < countsBuffer.length; l++) {
                                    let city = coalition.cities[l];
                                    let value = countsBuffer[l];
                                    if (value != null) {
                                        counts[city - minCity] +=
                                            value * city * normalize;
                                    }
                                }
                            }
                        }

                        let metric_index = metric_indexes[k];
                        let value_by_time = is_turn
                            ? coalition.turn.data[metric_index][j]
                            : coalition.day.data[metric_index][j];
                        if (value_by_time && value_by_time.length != 0) {
                            let value_by_city = value_by_time[metricI];
                            if (value_by_city && value_by_city.length != 0) {
                                if (isCumulative) {
                                    for (
                                        let l = 0;
                                        l < value_by_city.length;
                                        l++
                                    ) {
                                        let value = value_by_city[l];
                                        if (value != null) {
                                            let city = coalition.cities[l];
                                            aaBuffer[city - minCity] += value;
                                        }
                                    }
                                } else {
                                    for (
                                        let l = 0;
                                        l < value_by_city.length;
                                        l++
                                    ) {
                                        let value = value_by_city[l];
                                        if (value != null) {
                                            let city = coalition.cities[l];
                                            aaBuffer[city - minCity] = value;
                                        }
                                    }
                                }
                            }
                        }
                        for (let l = 0; l < aaBuffer.length; l++) {
                            tierData[l] += aaBuffer[l];
                        }
                    }
                    last_day = dayI;
                }
                colorIndex++;
                if (stackByAlliance) {
                    jUsed++;
                }
            }
            if (!stackByAlliance) {
                jUsed++;
            }
        }

        let response: DataSet[] = new Array(len);
        for (let i = 0; i < dataBeforeNormalize.length; i++) {
            let [col, label, color, data, counts] = dataBeforeNormalize[i];
            // iterate data, and set each array to previous value if empty
            let normalized: number[][] = new Array(data.length);
            let dataPrev: number[] | null = null;
            for (let k = 0; k < data.length; k++) {
                let dataK = data[k];
                if (!dataK || dataK.length == 0) {
                    if (dataPrev) {
                        dataK = dataPrev;
                    }
                }
                dataPrev = dataK;
                if (dataK && dataK.length > 0 && counts) {
                    let countsK = counts[k];
                    for (let j = 0; j < dataK.length; j++) {
                        let divisor = countsK[j];
                        dataK[j] = divisor ? dataK[j] / divisor : 0;
                    }
                }
                normalized[k] = dataK;
            }
            response[i] = {
                group: col,
                label: label,
                color: color,
                data: normalized,
            };
        }
        return {
            data: response,
            time: [time_min, time_max],
            is_turn: isAnyTurn,
            city_range: [minCity, maxCity],
        };
    }
</script>

<svelte:head>
    <title>Graphs</title>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.css"
    />
</svelte:head>
<div class="container-fluid p-2 ux-page-body">
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <a href="conflicts" aria-label="Back to conflicts"
            ><i class="bi bi-arrow-left"></i></a
        >&nbsp;Conflict Tiering: {conflictName}
    </h1>
    <ConflictRouteTabs {conflictId} active="tiering" />
    <div
        class="row m-0 p-0 ux-surface ux-tab-panel"
        style="min-height: 116px; position: relative; z-index: 80; overflow: visible;"
    >
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
        <div class="col-12">
            <div
                class="p-1 fw-bold border-bottom border-3 pb-0"
                style="min-height: 71px;"
            >
                {#if _rawData}
                    <div
                        class="ux-coalition-panel ux-coalition-panel--compact ux-coalition-panel--red"
                    >
                        {_rawData?.coalitions[0].name}:
                        {#each _rawData.coalitions[0].alliance_ids as id, index}
                            <button
                                class="btn ux-btn btn-sm ms-1 mb-1"
                                class:active={_allowedAllianceIds.has(id)}
                                on:click={() => setLayoutAlliance(0, id)}
                                >{formatAllianceName(
                                    _rawData.coalitions[0].alliance_names[
                                        index
                                    ],
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
                                class="btn ux-btn btn-sm ms-1 mb-1"
                                class:active={_allowedAllianceIds.has(id)}
                                on:click={() => setLayoutAlliance(1, id)}
                                >{formatAllianceName(
                                    _rawData.coalitions[1].alliance_names[
                                        index
                                    ],
                                    id,
                                )}</button
                            >
                        {/each}
                    </div>
                {/if}
            </div>
            <div
                style="width: calc(100% - 30px);margin-left:15px;position: relative; z-index: 1;"
            >
                <div class="mt-3 mb-5" bind:this={sliderElement}></div>
            </div>
            <div
                class="select-compact mb-1"
                style="position: relative; z-index: 3;"
            >
                <Select
                    multiple
                    {items}
                    bind:value={selected_metrics}
                    showChevron={true}
                >
                    <div class="empty" slot="empty">
                        {maxItems ? "Max 4 items" : "No options"}
                    </div>
                </Select>
            </div>
            <div
                class="ux-control-strip mb-1"
                style="position: relative; z-index: 2;"
            >
                <ShareResetBar
                    onReset={resetFilters}
                    resetDirty={isResetDirty}
                />
                <label for="inlineCheckbox1" class="ux-toggle-chip">
                    <span>Use Percent</span>
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="inlineCheckbox1"
                        value="option1"
                        bind:checked={normalize}
                        on:change={handlePercentCheck}
                    />
                </label>
                <label for="inlineCheckbox2" class="ux-toggle-chip">
                    <span>Single Color</span>
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="inlineCheckbox2"
                        value="option1"
                        bind:checked={useSingleColor}
                        on:change={handleColorCheck}
                    />
                </label>
                <button
                    type="button"
                    class="btn btn-link btn-sm p-0 align-baseline"
                    title="Metrics with ':' are cumulative sums across time ranges. Without ':', values represent the selected point in time."
                    aria-label="Metric behavior help"
                >
                    <i class="bi bi-info-circle"></i>
                </button>
                {#if _rawData}
                    <div class="ux-quick-layouts">
                        <span class="fw-bold">Quick Layouts:</span>
                        {#each Object.entries(_chartLayouts) as [name, _layout]}
                            <button
                                on:click={() => setLayout(name)}
                                class="btn ux-btn btn-sm fw-bold"
                            >
                                {name}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
    <div class="container-fluid m-0 p-0 mt-2 ux-surface p-2">
        <div
            class="chart-container"
            style="position: relative; height:80vh; width:100%;"
        >
            <canvas id="myChart"></canvas>
        </div>
        <!-- <canvas id="myChart" width="400" height="400"></canvas> -->
    </div>
    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}
</div>
