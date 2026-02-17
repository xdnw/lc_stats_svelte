<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import Select from "svelte-select";
    import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
    import ShareResetBar from "../../components/ShareResetBar.svelte";
    import Progress from "../../components/Progress.svelte";
    import noUiSlider from "nouislider";
    import * as d3 from "d3";
    import {
        decompressBson,
        type GraphData,
        formatTurnsToDate,
        formatDaysToDate,
        Palette,
        generateColors,
        setQueryParam,
        arrayEquals,
        type TierMetric,
        resolveMetricAccessors,
        getConflictGraphDataUrl,
        ensureScriptsLoaded,
        applySavedQueryParamsIfMissing,
        saveCurrentQueryParams,
        resetQueryParams,
        formatDatasetProvenance,
        formatAllianceName,
    } from "$lib";
    import { config } from "../+layout";

    function getPlotly(): any {
        return (window as any).Plotly;
    }

    let _rawData: GraphData;
    let conflictId: string | null = null;
    let conflictName: string;
    let _loaded = false;
    let _loadError: string | null = null;
    let datasetProvenance = "";

    let normalize_x: boolean = false;
    let normalize_y: boolean = false;
    let normalize_z: boolean = false;
    let previous_normalize: number = 0;

    let sliderElement: HTMLDivElement;
    let cityValues: number[] = [0, 70];
    let graphSliderIndex: number = 0;
    let sliderSetListener: ((values: string[]) => void) | null = null;
    let plotlyAnimatedListener: (() => void) | null = null;
    let plotlySliderChangeListener: ((sliderData: any) => void) | null = null;

    const defaultMetricSelection = [
        "dealt:loss_value",
        "loss:loss_value",
        "off:wars",
    ];
    let selected_metrics: { value: string; label: string }[] =
        defaultMetricSelection.map((name) => {
            return { value: name, label: name };
        });
    $: maxItems = selected_metrics?.length === 3;
    $: items =
        maxItems || !_rawData
            ? []
            : [
                  ..._rawData.metric_names.map((name) => {
                      return { value: name, label: name };
                  }),
              ];

    let previous_selected: { value: string; label: string }[] = [];

    function getSliderApi(): any {
        return (sliderElement as any)?.noUiSlider;
    }

    function handleMetricsChange() {
        if (
            selected_metrics.length != 3 ||
            arrayEquals(previous_selected, selected_metrics)
        )
            return;
        maxItems = selected_metrics?.length === 3;
        previous_selected = selected_metrics.slice();
        setQueryParam(
            "selected",
            selected_metrics.map((metric) => metric.value).join("."),
        );
        saveCurrentQueryParams();
        setupGraphData(_rawData);
    }

    async function handleCheckbox(): Promise<boolean> {
        await tick();
        let normalizeBits =
            (normalize_x ? 1 : 0) +
            (normalize_y ? 2 : 0) +
            (normalize_z ? 4 : 0);
        if (previous_normalize == normalizeBits) return false;
        previous_normalize = normalizeBits | 0;
        setQueryParam("normalize", normalizeBits == 0 ? null : normalizeBits, {
            replace: true,
        });
        saveCurrentQueryParams();
        setupGraphData(_rawData);
        return true;
    }

    function resetFilters() {
        cityValues = [0, 70];
        graphSliderIndex = 0;
        normalize_x = false;
        normalize_y = false;
        normalize_z = false;
        previous_normalize = 0;
        selected_metrics = [
            "dealt:loss_value",
            "loss:loss_value",
            "off:wars",
        ].map((name) => ({ value: name, label: name }));
        previous_selected = selected_metrics.slice();

        resetQueryParams(
            ["city_min", "city_max", "time", "normalize", "selected"],
            ["id"],
        );
        setQueryParam(
            "selected",
            selected_metrics.map((metric) => metric.value).join("."),
            { replace: true },
        );
        saveCurrentQueryParams();

        const sliderApi = getSliderApi();
        if (sliderApi) {
            sliderApi.set([cityValues[0], cityValues[1]]);
        }

        if (_rawData) {
            setupGraphData(_rawData);
        }
    }

    function loadQueryParams(params: URLSearchParams) {
        let time = params.get("time");
        if (time && !isNaN(+time) && Number.isInteger(+time)) {
            graphSliderIndex = +time;
        }
        let cityMin = params.get("city_min");
        let cityMax = params.get("city_max");
        if (cityMin && !isNaN(+cityMin) && Number.isInteger(+cityMin)) {
            cityValues[0] = +cityMin;
        }
        if (cityMax && !isNaN(+cityMax) && Number.isInteger(+cityMax)) {
            cityValues[1] = +cityMax;
        }
        let selected = params.get("selected");
        if (selected) {
            selected_metrics = selected.split(".").map((name) => {
                return { value: name, label: name };
            });
        }
        previous_selected = selected_metrics.slice();
        maxItems = selected_metrics?.length === 3;
        let normalizeBits = params.get("normalize");
        if (
            normalizeBits &&
            !isNaN(+normalizeBits) &&
            Number.isInteger(+normalizeBits)
        ) {
            let bits = +normalizeBits;
            normalize_x = (bits & 1) != 0;
            normalize_y = (bits & 2) != 0;
            normalize_z = (bits & 4) != 0;
            previous_normalize = bits;
        }
    }
    let graphDiv: HTMLDivElement;
    onMount(async () => {
        applySavedQueryParamsIfMissing(
            ["city_min", "city_max", "time", "normalize", "selected"],
            ["id"],
        );
        let queryParams = new URLSearchParams(window.location.search);
        loadQueryParams(queryParams);

        const id = queryParams.get("id");
        if (id) {
            conflictId = id;
            fetchConflictGraphData(conflictId);
        } else {
            _loadError = "Missing conflict id in URL";
        }
        noUiSlider.create(sliderElement, {
            start: cityValues,
            connect: true,
            step: 1,
            tooltips: [
                { to: (value) => `City ${Math.round(value)}` },
                { to: (value) => `City ${Math.round(value)}` },
            ],
            range: {
                min: 0,
                max: 70,
            },
            pips: {
                mode: "steps" as any,
                density: 5,
                filter: (value, _type) => {
                    return value % 5 ? 0 : 2;
                },
            },
        });

        sliderSetListener = (values: string[]) => {
            cityValues = values.map((value) => parseInt(value));
            setQueryParam(
                "city_min",
                cityValues[0] == 0 ? null : cityValues[0],
                { replace: true },
            );
            setQueryParam(
                "city_max",
                cityValues[1] == 70 ? null : cityValues[1],
                { replace: true },
            );
            saveCurrentQueryParams();
            setupGraphData(_rawData);
        };
        getSliderApi()?.on("set", sliderSetListener);
    });

    onDestroy(() => {
        const sliderApi = getSliderApi();
        if (sliderApi) {
            if (sliderSetListener) {
                sliderApi.off("set", sliderSetListener);
            }
            sliderApi.destroy();
        }
        if (graphDiv) {
            const graphDivAny = graphDiv as any;
            if (plotlyAnimatedListener) {
                graphDivAny.removeListener?.(
                    "plotly_animated",
                    plotlyAnimatedListener,
                );
            }
            if (plotlySliderChangeListener) {
                graphDivAny.removeListener?.(
                    "plotly_sliderchange",
                    plotlySliderChangeListener,
                );
            }
            getPlotly()?.purge(graphDiv);
        }
    });

    function fetchConflictGraphData(conflictId: string) {
        let start = Date.now();
        let url = getConflictGraphDataUrl(
            conflictId,
            config.version.graph_data,
        );
        decompressBson(url)
            .then((data) => {
                console.log(`Loaded ${url} in ${Date.now() - start}ms`);
                start = Date.now();
                conflictName = data.name;
                _rawData = data;
                datasetProvenance = formatDatasetProvenance(
                    config.version.graph_data,
                    (data as any).update_ms,
                );
                _loadError = null;
                setupGraphData(_rawData);
                _loaded = true;
                saveCurrentQueryParams();
            })
            .catch((error) => {
                console.error("Failed to load bubble graph data", error);
                _loadError =
                    "Could not load conflict graph data. Please try again later.";
                _loaded = true;
            });
    }

    function retryLoad() {
        if (!conflictId) return;
        _loaded = false;
        _loadError = null;
        fetchConflictGraphData(conflictId);
    }

    interface Trace {
        x: number[];
        y: number[];
        customdata: number[];
        id: number[];
        text: string[];
        marker: { size: number[] };
    }
    interface Range {
        x: number[];
        y: number[];
        z: number[];
    }

    interface Timeframe {
        start: number;
        end: number;
        is_turn: boolean;
    }

    function getFullName(metric: TierMetric): string {
        let fullName = metric.name;
        if (metric.cumulative) {
            fullName += " (sum)";
        }
        if (metric.normalize) {
            fullName += " (avg)";
        }
        return fullName;
    }

    function generateTraces(
        data: GraphData,
        x_axis: TierMetric,
        y_axis: TierMetric,
        size: TierMetric,
        min_city: number,
        max_city: number,
    ): {
        traces: { [key: number]: { [key: number]: Trace } };
        times: Timeframe;
        ranges: Range;
    } | null {
        // trim metric names using trimHeader(name)

        let ranges: Range = {
            x: [0, Number.MIN_SAFE_INTEGER],
            y: [0, Number.MIN_SAFE_INTEGER],
            z: [0, Number.MIN_SAFE_INTEGER],
        };
        let rangesKeys: (keyof typeof ranges)[] = Object.keys(
            ranges,
        ) as (keyof typeof ranges)[];

        let metrics = [x_axis, y_axis, size];
        const metricAccessors = resolveMetricAccessors(data, metrics);
        if (!metricAccessors) return null;
        let metric_indexes = metricAccessors.metric_indexes;
        let metric_is_turn = metricAccessors.metric_is_turn;
        let metric_normalize = metricAccessors.metric_normalize;
        let isAnyTurn = metricAccessors.isAnyTurn;
        let lookup: { [key: number]: { [key: number]: Trace } } = {}; // year -> coalitions

        for (let i = 0; i < data.coalitions.length; i++) {
            let coalition = data.coalitions[i];
            let minCityIndex = coalition.cities.findIndex(
                (city) => city >= min_city,
            );
            let maxCityIndex = coalition.cities
                .slice()
                .reverse()
                .findIndex((city) => city <= max_city);
            if (maxCityIndex !== -1)
                maxCityIndex = coalition.cities.length - 1 - maxCityIndex;
            if (minCityIndex == -1) minCityIndex = 0;
            if (maxCityIndex == -1) maxCityIndex = coalition.cities.length;

            let turn_start = coalition.turn.range[0];
            let day_start = coalition.day.range[0];
            let start = isAnyTurn ? turn_start : day_start;
            let end = isAnyTurn
                ? coalition.turn.range[1]
                : coalition.day.range[1];

            for (let j = 0; j < coalition.alliance_ids.length; j++) {
                let alliance_id = coalition.alliance_ids[j];
                let name = formatAllianceName(
                    coalition.alliance_names[j],
                    alliance_id,
                );

                let buffer: number[] = [0, 0, 0];
                let lastDay = -1;
                for (let turnOrDay = start; turnOrDay <= end; turnOrDay++) {
                    let traceByCol = lookup[turnOrDay];
                    if (!traceByCol) {
                        traceByCol = {};
                        lookup[turnOrDay] = traceByCol;
                    }
                    let trace = traceByCol[i];
                    if (!trace) {
                        trace = {
                            x: [],
                            y: [],
                            id: [],
                            text: [],
                            customdata: [],
                            marker: { size: [] },
                        };
                        traceByCol[i] = trace;
                    }
                    trace.id.push(alliance_id);
                    trace.text.push(name);

                    let turn = isAnyTurn
                        ? turnOrDay
                        : Math.floor(turnOrDay * 12);
                    let day = isAnyTurn
                        ? Math.floor(turnOrDay / 12)
                        : turnOrDay;
                    for (let k = 0; k < metrics.length; k++) {
                        let is_turn = metric_is_turn[k];
                        if (!is_turn && lastDay == day) continue;
                        let isCumulative = metrics[k].cumulative;

                        let metric_index = metric_indexes[k];

                        let value_by_day = is_turn
                            ? coalition.turn.data[metric_index][j]
                            : coalition.day.data[metric_index][j];
                        if (!value_by_day) {
                            continue;
                        }
                        let value_by_city =
                            value_by_day[
                                is_turn ? turn - turn_start : day - day_start
                            ];
                        if (
                            !value_by_city ||
                            Object.keys(value_by_city).length == 0
                        ) {
                            continue;
                        }
                        let total = 0.0;
                        for (let l = minCityIndex; l <= maxCityIndex; l++) {
                            total += value_by_city[l];
                        }
                        let normalize = metric_normalize[k];
                        if (normalize != -1) {
                            let nations = 0.0;
                            let nation_counts_by_day = coalition.day.data[0][j];
                            if (!nation_counts_by_day) continue;
                            let nation_counts =
                                nation_counts_by_day[day - day_start];
                            if (!nation_counts || nation_counts.length == 0)
                                continue;
                            if (normalize == 0) {
                                for (
                                    let l = minCityIndex;
                                    l <= maxCityIndex;
                                    l++
                                ) {
                                    nations += nation_counts[l];
                                }
                            } else {
                                for (
                                    let l = minCityIndex;
                                    l <= maxCityIndex;
                                    l++
                                ) {
                                    let cities = coalition.cities[l];
                                    nations +=
                                        nation_counts[l] * cities * normalize;
                                }
                            }
                            if (nations != 0) {
                                total /= nations;
                            }
                        }
                        if (isCumulative) {
                            buffer[k] += total;
                        } else {
                            buffer[k] = total;
                        }
                    }
                    trace.x.push(buffer[0]);
                    trace.y.push(buffer[1]);
                    trace.customdata.push(buffer[2]);

                    for (let k = 0; k < 3; k++) {
                        let ri = rangesKeys[k];
                        if (buffer[k] < ranges[ri][0])
                            ranges[ri][0] = buffer[k];
                        if (buffer[k] > ranges[ri][1])
                            ranges[ri][1] = buffer[k];
                    }

                    lastDay = day;
                }
                // print buffer values
                // console.log("# " + name + " " + alliance_id);
                // console.log("- " + metrics[0].name + ": " + buffer[0]);
                // console.log("- " + metrics[1].name + ": " + buffer[1]);
                // console.log("- " + metrics[2].name + ": " + buffer[2]);
            }
        }
        // min value from lookup keys
        let start = Math.min(...Object.keys(lookup).map(Number));
        let end = Math.max(...Object.keys(lookup).map(Number));
        let times: Timeframe = { start: start, end: end, is_turn: isAnyTurn };
        return { traces: lookup, times, ranges };
    }

    function setupGraphData(data: GraphData) {
        if (!data) return;
        let metrics_copy = selected_metrics.map((metric) => metric.value);
        if (metrics_copy.length != 3) return;
        let start = Date.now();
        let metric_x: TierMetric = {
            name: metrics_copy[0],
            cumulative: metrics_copy[0].includes(":"),
            normalize: normalize_x,
        };
        let metric_y: TierMetric = {
            name: metrics_copy[1],
            cumulative: metrics_copy[1].includes(":"),
            normalize: normalize_y,
        };
        let metric_size: TierMetric = {
            name: metrics_copy[2],
            cumulative: metrics_copy[2].includes(":"),
            normalize: normalize_z,
        };
        let tracesTime = generateTraces(
            data,
            metric_x,
            metric_y,
            metric_size,
            cityValues[0],
            cityValues[1],
        );
        if (!tracesTime) return;
        let coalition_names = data.coalitions.map(
            (coalition) => coalition.name,
        );
        let metrics: [TierMetric, TierMetric, TierMetric] = [
            metric_x,
            metric_y,
            metric_size,
        ];
        console.log(`Generated traces in ${Date.now() - start}ms`);
        createGraph(
            tracesTime.traces,
            tracesTime.times,
            tracesTime.ranges,
            coalition_names,
            metrics,
        );
    }

    function createGraph(
        lookup: { [key: number]: { [key: number]: Trace } },
        time: { start: number; end: number; is_turn: boolean },
        _ranges: { x: number[]; y: number[]; z: number[] },
        coalition_names: string[],
        metrics: [TierMetric, TierMetric, TierMetric],
    ) {
        let start = Date.now();

        // Get the group names:
        var years: number[] = Object.keys(lookup).map(Number);
        if (years.length === 0) return;
        // In this case, every year includes every continent, so we
        // can just infer the continents from the *first* year:
        graphSliderIndex = Math.min(
            Math.max(graphSliderIndex, 0),
            Math.max(years.length - 1, 0),
        );
        var firstYear = lookup[time.start + graphSliderIndex];
        if (!firstYear) return;
        var coalitions: number[] = Object.keys(firstYear).map(Number);

        let maxZbyTime: number[] = [];
        for (let i = time.start; i <= time.end; i++) {
            let lookupByTime = lookup[i];
            if (!lookupByTime) {
                continue;
            }
            let maxZ = 0;
            for (let j = 0; j < coalition_names.length; j++) {
                let data = lookupByTime[j];
                if (!data) continue;
                maxZ = Math.max(maxZ, Math.max(...data.customdata));
            }
            maxZbyTime.push(maxZ);
            for (let j = 0; j < coalition_names.length; j++) {
                let data = lookupByTime[j];
                if (!data) continue;
                data.marker = {
                    size: data.customdata.map((size) => {
                        return maxZ > 0 ? size / maxZ : 1;
                    }),
                };
            }
        }

        // Create a lookup table to sort and regroup the columns of data,
        // first by year, then by continent:
        function getData(time: number, coalition: number) {
            let lookupByTime = lookup[time];
            if (!lookupByTime) {
                lookupByTime = lookup[time] = {};
            }
            let trace = lookupByTime[coalition];
            if (!trace) {
                trace = lookupByTime[coalition] = {
                    x: [],
                    y: [],
                    customdata: [],
                    id: [],
                    text: [],
                    marker: { size: [] },
                };
            }
            return trace;
        }

        // Create the main traces, one for each continent:
        let previousPositions: {
            [key: number]: {
                x: { [key: number]: number[] };
                y: { [key: number]: number[] };
                z: { [key: number]: number[] };
            };
        } = {};
        // Create a frame for each year. Frames are effectively just
        // traces, except they don't need to contain the *full* trace
        // definition (for example, appearance). The frames just need
        // the parts the traces that change (here, the data).
        var frames: any[] = [];
        for (let i = 0; i < years.length; i++) {
            let frameData = [];
            for (let j = 0; j < coalitions.length; j++) {
                let colId = coalitions[j];
                let previousLines = previousPositions[colId];
                if (!previousLines) {
                    previousLines = previousPositions[colId] = {
                        x: {},
                        y: {},
                        z: {},
                    };
                }
                let data = getData(years[i], colId);
                for (let k = 0; k < data.id.length; k++) {
                    let id = data.id[k];
                    let prevX = previousLines.x[id];
                    let prevY = previousLines.y[id];
                    let prevZ = previousLines.z[id];
                    if (!prevX) {
                        prevX = previousLines.x[id] = [];
                        prevY = previousLines.y[id] = [];
                        prevZ = previousLines.z[id] = [];
                    }
                    prevX.push(data.x[k]);
                    prevY.push(data.y[k]);
                    prevZ.push(data.customdata[k]);
                    frameData.push({
                        x: prevX.slice(),
                        y: prevY.slice(),
                        customdata: prevZ.slice(),
                        mode: "lines",
                    });
                }
                frameData.push(data);
            }
            frames.push({
                name: years[i],
                data: frameData,
            });
        }

        var traces: any[] = [];
        for (let i = 0; i < coalitions.length; i++) {
            let colId = coalitions[i];
            var data = firstYear[colId];

            let palette: Palette = Object.keys(Palette)
                .map(Number)
                .indexOf(colId);
            let colors = generateColors(d3, data.id.length, palette);

            let previousLines = previousPositions[colId];
            if (!previousLines) {
                previousLines = previousPositions[colId] = {
                    x: {},
                    y: {},
                    z: {},
                };
            }

            // Update the previous positions of the bubbles by alliance id
            for (let j = 0; j < data.id.length; j++) {
                let id = data.id[j];
                let prevX = previousLines.x[id];
                let prevY = previousLines.y[id];
                let prevZ = previousLines.z[id];
                if (!prevX) {
                    prevX = [];
                    prevY = [];
                    prevZ = [];
                }
                traces.push({
                    x: prevX.slice(0, graphSliderIndex + 1),
                    y: prevY.slice(0, graphSliderIndex + 1),
                    customdata: prevZ.slice(0, graphSliderIndex + 1),
                    mode: "lines",
                    line: {
                        width: 0.3,
                        color: colors[j],
                    },
                    hoverinfo: "all",
                    showlegend: false,
                    hovertemplate: `${data.text[j]}<br>${metrics[0].name}: %{x}<br>${metrics[1].name}: %{y}<br>${metrics[2].name}: %{customdata}<extra></extra>`,
                });
            }

            traces.push({
                name: coalition_names[i],
                x: data.x.slice(),
                y: data.y.slice(),
                customdata: data.customdata.slice(),
                id: data.id.slice(),
                text: data.text.slice(),
                mode: "markers+text",
                textposition: "middle center",
                textfont: {
                    size: 7,
                    color: "rgba(0, 0, 0, 0.75)", // black with 50% opacity
                },
                marker: {
                    size: data.marker.size,
                    sizemode: "area",
                    sizeref: 0.001,
                    sizemin: 1,
                    color: colors,
                },
                hovertemplate: `%{text}<br>${metrics[0].name}: %{x}<br>${metrics[1].name}: %{y}<br>${metrics[2].name}: %{customdata}<extra></extra>`,
            });
        }

        let timeFormat = time.is_turn ? formatTurnsToDate : formatDaysToDate;

        // Now create slider steps, one for each frame. The slider
        // executes a plotly.js API command (here, Plotly.animate).
        // In this example, we'll animate to one of the named frames
        // created in the above loop.
        var sliderSteps = [];
        for (let i = 0; i < years.length; i++) {
            sliderSteps.push({
                method: "animate",
                label: timeFormat(years[i]),
                args: [
                    [years[i]],
                    {
                        mode: "immediate",
                        transition: { duration: 200 },
                        frame: { duration: 200, redraw: true },
                    },
                ],
            });
        }

        var layout: any = {
            height: window.innerHeight * 0.8,
            margin: { l: 0, r: 0, t: 30, b: 60 },
            xaxis: {
                title: getFullName(metrics[0]),
            },
            yaxis: {
                title: getFullName(metrics[1]),
            },
            hovermode: "closest",
            legend: {
                x: 0.5,
                y: 1.1,
                itemsizing: "constant",
                xanchor: "center",
                yanchor: "top",
            },
            // We'll use updatemenus (whose functionality includes menus as
            // well as buttons) to create a play button and a pause button.
            // The play button works by passing `null`, which indicates that
            // Plotly should animate all frames. The pause button works by
            // passing `[null]`, which indicates we'd like to interrupt any
            // currently running animations with a new list of frames. Here
            // The new list of frames is empty, so it halts the animation.
            updatemenus: [
                {
                    x: 0,
                    y: 0,
                    yanchor: "top",
                    xanchor: "left",
                    showactive: false,
                    direction: "left",
                    type: "buttons",
                    pad: { t: 87, r: 10 },
                    buttons: [
                        {
                            method: "animate",
                            args: [
                                null,
                                {
                                    mode: "immediate",
                                    fromcurrent: true,
                                    transition: { duration: 200 },
                                    frame: { duration: 200, redraw: true },
                                },
                            ],
                            label: "Play",
                        },
                        {
                            method: "animate",
                            args: [
                                [null],
                                {
                                    mode: "immediate",
                                    transition: { duration: 0 },
                                    frame: { duration: 0, redraw: true },
                                },
                            ],
                            label: "Pause",
                        },
                    ],
                },
            ],
            // Finally, add the slider and use `pad` to position it
            // nicely next to the buttons.
            sliders: [
                {
                    active: graphSliderIndex,
                    pad: { l: 130, t: 55 },
                    currentvalue: {
                        visible: true,
                        prefix: "",
                        xanchor: "right",
                        font: { size: 20, color: "#666" },
                    },
                    steps: sliderSteps,
                },
            ],
        };

        // is either dark, light, or empty (light)
        let theme = document.documentElement.getAttribute("data-bs-theme");
        if (theme === "dark") {
            console.log("Dark theme");
            let bodyBg = getComputedStyle(
                document.documentElement,
            ).getPropertyValue("--bs-body-bg");
            let bodyColor = getComputedStyle(
                document.documentElement,
            ).getPropertyValue("--bs-body-color");
            layout.plot_bgcolor = bodyBg;
            layout.paper_bgcolor = bodyBg;
            layout.font = { color: bodyColor };
            layout.xaxis = {
                ...layout.xaxis,
                gridcolor: bodyColor,
                zerolinecolor: bodyColor,
                tickfont: { color: bodyColor },
                titlefont: { color: bodyColor },
            };
            layout.yaxis = {
                ...layout.yaxis,
                gridcolor: bodyColor,
                zerolinecolor: bodyColor,
                tickfont: { color: bodyColor },
                titlefont: { color: bodyColor },
            };
            layout.legend = {
                ...layout.legend,
                font: { color: bodyColor },
            };
        }

        console.log(`Generated graph data in ${Date.now() - start}ms`);
        start = Date.now();

        ensureScriptsLoaded(["plotjs"]).then(() => {
            const plotly = getPlotly();
            if (!plotly) return;
            const graphDivAny = graphDiv as any;
            plotly.purge(graphDiv);
            plotly.react(graphDiv, {
                data: traces,
                layout: layout,
                frames: frames,
            });
            if (plotlyAnimatedListener) {
                graphDivAny.removeListener?.(
                    "plotly_animated",
                    plotlyAnimatedListener,
                );
            }
            if (plotlySliderChangeListener) {
                graphDivAny.removeListener?.(
                    "plotly_sliderchange",
                    plotlySliderChangeListener,
                );
            }
            plotlyAnimatedListener = function () {
                plotly.relayout(graphDiv, {
                    "xaxis.autorange": true,
                    "yaxis.autorange": true,
                });
            };
            plotlySliderChangeListener = function (sliderData: any) {
                graphSliderIndex = sliderData.slider.active;
                setQueryParam("time", graphSliderIndex, { replace: true });
                saveCurrentQueryParams();
            };
            graphDivAny.on?.("plotly_animated", plotlyAnimatedListener);
            graphDivAny.on?.("plotly_sliderchange", plotlySliderChangeListener);
            console.log(`Setup reactive plot in ${Date.now() - start}ms`);
            start = Date.now();
        });
    }
</script>

<svelte:head>
    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.css"
    />
</svelte:head>
<div class="container-fluid p-2 ux-page-body">
    <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
        <a href="conflicts" aria-label="Back to conflicts"
            ><i class="bi bi-arrow-left"></i></a
        >&nbsp;Conflict: {conflictName}
        {#if (_rawData as any)?.wiki}
            <a
                class="btn ux-btn fw-bold"
                href="https://politicsandwar.fandom.com/wiki/{(_rawData as any)
                    .wiki}"
                >Wiki:{(_rawData as any)?.wiki}&nbsp;<i
                    class="bi bi-box-arrow-up-right"
                ></i></a
            >
        {/if}
    </h1>
    <ConflictRouteTabs {conflictId} active="bubble" />
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
            <div style="width: calc(100% - 30px);margin-left:15px;">
                <div
                    class="mt-3 mb-5"
                    style="position: relative; z-index: 1;"
                    bind:this={sliderElement}
                ></div>
            </div>
            {#if _rawData}
                <div class="d-flex justify-content-between align-items-center">
                    <span class="fw-bold"
                        >Select 3
                        <button
                            type="button"
                            class="btn btn-link btn-sm p-0 ms-1 align-baseline"
                            title="Metrics with ':' are cumulative sums over time. Metrics without ':' are point-in-time values for each frame."
                            aria-label="Metric behavior help"
                        >
                            <i class="bi bi-info-circle"></i>
                        </button></span
                    >
                    <ShareResetBar onReset={resetFilters} />
                </div>
                <div
                    class="select-compact mb-2"
                    style="position: relative; z-index: 3;"
                >
                    <Select
                        multiple
                        {items}
                        on:change={handleMetricsChange}
                        bind:value={selected_metrics}
                        showChevron={true}
                    >
                        <div class="empty" slot="empty">
                            {maxItems ? "Max 3 items" : "No options"}
                        </div>
                    </Select>
                </div>
                <div class="small text-muted mb-2">
                    Metrics: {selected_metrics
                        .map((item) => item.label)
                        .join(" / ")} • Cities {cityValues[0]}-{cityValues[1]}
                </div>
                <span class="fw-bold">Per Unit or Nation:</span>
                <div
                    class="form-check form-check-inline"
                    style="position: relative; z-index: 2;"
                >
                    <label class="form-check-label" for="inlineCheckbox1"
                        >X</label
                    >
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="inlineCheckbox1"
                        value="option1"
                        bind:checked={normalize_x}
                        on:change={handleCheckbox}
                    />
                </div>
                <div
                    class="form-check form-check-inline"
                    style="position: relative; z-index: 2;"
                >
                    <label class="form-check-label" for="inlineCheckbox2"
                        >Y</label
                    >
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="inlineCheckbox2"
                        value="option2"
                        bind:checked={normalize_y}
                        on:change={handleCheckbox}
                    />
                </div>
                <div
                    class="form-check form-check-inline"
                    style="position: relative; z-index: 2;"
                >
                    <label class="form-check-label" for="inlineCheckbox3"
                        >Z</label
                    >
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="inlineCheckbox3"
                        value="option3"
                        bind:checked={normalize_z}
                        on:change={handleCheckbox}
                    />
                </div>
            {/if}
        </div>
    </div>
    <div
        class="row m-0 p-0 mt-2 ux-surface"
        style="overflow-x: hidden; position: relative; z-index: 1;"
    >
        <div class="col-12 m-0 p-0">
            <div class="m-0 p-0" bind:this={graphDiv}></div>
        </div>
    </div>
    {#if datasetProvenance}
        <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
    {/if}
</div>
