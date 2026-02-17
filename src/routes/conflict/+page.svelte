<script lang="ts">
  /**
   * This page is for viewing a single conflict
   */
  import ConflictRouteTabs from "../../components/ConflictRouteTabs.svelte";
  import ShareResetBar from "../../components/ShareResetBar.svelte";
  import Progress from "../../components/Progress.svelte";
  import { onMount } from "svelte";
  import {
    addFormatters,
    decompressBson,
    formatDate,
    setupContainer,
    type Conflict,
    setQueryParam,
    trimHeader,
    type TableData,
    ExportTypes,
    downloadTableElem,
    applySavedQueryParamsIfMissing,
    saveCurrentQueryParams,
    resetQueryParams,
    formatDatasetProvenance,
    formatAllianceName,
  } from "$lib";
  import { config } from "../+layout";
  // Layout tabs
  const Layout = {
    COALITION: 0,
    ALLIANCE: 1,
    NATION: 2,
  };

  // Set after page load
  let conflictName = "";
  let conflictId: string | null = null;
  let _loaded = false;
  let _loadError: string | null = null;
  let datasetProvenance = "";

  // see loadLayout for the type
  let _rawData: Conflict | null = null;
  // The columns for the `attacks` layout button
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
  // The layouts buttons for the conflict table
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

  // Variable for the current layout
  // Set by the layout buttons as well as on page load (loadLayoutFromQuery)
  let _layoutData = {
    layout: Layout.COALITION,
    columns: layouts.Summary.columns,
    sort: layouts.Summary.sort,
    order: "desc",
  };
  let _currentRowData: TableData;
  const getVis = (): any => (window as any).vis;

  /**
   * Big function for loading the conflict table for a provided layout
   * This will clear and recreate the table
   * Called on page load from (loadLayoutFromQuery)
   * Tab buttons edit the layout global var then call this (loadCurrentLayout)
   * @param _rawData The S3 bucket json data
   * @param type The Layout type (coalition, alliance, nation)
   * @param layout The columns to display
   * @param sortBy The column to sort by
   * @param sortDir The direction to sort by (asc, desc)
   */
  function loadLayout(
    _rawData: Conflict,
    type: number,
    layout: string[],
    sortBy: string,
    sortDir: string,
  ) {
    conflictName = _rawData.name;
    let coalitions = _rawData.coalitions;
    let damage_header = _rawData.damage_header;
    let header_types = _rawData.header_type;

    let rows: any[][] = [];
    let columns: string[] = [];
    let searchable: number[] = [];
    let visible: number[] = [];
    let cell_format: { [key: string]: number[] } = {};
    let row_format:
      | ((row: HTMLElement, data: any, index: number) => void)
      | null = null;

    // Alliance ids (set)
    let col1: Set<number> = new Set<number>(coalitions[0].alliance_ids);
    let col2: Set<number> = new Set<number>(coalitions[1].alliance_ids);

    // Set the row format based on the layout
    switch (type) {
      case Layout.COALITION:
        row_format = (row: HTMLElement, data: any, _index: number) => {
          let name = data[0] as number;
          if (name == 0) {
            row.classList.add("bg-danger-subtle");
          } else if (name == 1) {
            row.classList.add("bg-info-subtle");
          }
        };
        break;
      case Layout.ALLIANCE:
        row_format = (row: HTMLElement, data: any, _index: number) => {
          let id = (data[0] as number[])[1];
          if (col1.has(id)) {
            row.classList.add("bg-danger-subtle");
          } else if (col2.has(id)) {
            row.classList.add("bg-info-subtle");
          }
        };
        break;
      case Layout.NATION:
        row_format = (row: HTMLElement, data: any, _index: number) => {
          let id = (data[0] as number[])[2] as number;
          if (col1.has(id)) {
            row.classList.add("bg-danger-subtle");
          } else if (col2.has(id)) {
            row.classList.add("bg-info-subtle");
          }
        };
        break;
    }

    // Add name column and
    // Split the header names into columns (e.g. net damage can be calculated from dealt and received)
    {
      // columns
      columns.push("name");
      for (let i = 0; i < damage_header.length; i++) {
        let header = trimHeader(damage_header[i]);
        let type = header_types[i];
        if (type == 0) {
          columns.push("loss:" + header);
          columns.push(
            "dealt:" + header.replace("_loss", "").replace("loss_", ""),
          );
          columns.push(
            "net:" + header.replace("_loss", "").replace("loss_", ""),
          );
        } else if (type == 1) {
          columns.push("def:" + header);
          columns.push("off:" + header);
          columns.push("both:" + header);
        }
      }
      searchable.push(0);
    }
    let sort: [number, string] = [columns.indexOf(sortBy), sortDir];
    // Set cell formatting and visible columns
    cell_format["formatNumber"] = [];
    cell_format["formatMoney"] = [];
    for (let i = 0; i < columns.length; i++) {
      if (layout.includes(columns[i])) {
        visible.push(i);
      }
      if (i > 0) {
        if (
          columns[i].includes("~") ||
          columns[i].includes("damage") ||
          (columns[i].includes("infra") && !columns[i].includes("attacks"))
        ) {
          cell_format["formatMoney"].push(i);
        } else {
          cell_format["formatNumber"].push(i);
        }
      }
    }

    // Helper function for adding the data for the columns into the rows
    let addStats2Row = (row: any[], damageTaken: any, damageDealt: any) => {
      for (let i = 0; i < damageTaken.length; i++) {
        let damageTakenStat = damageTaken[i];
        let damageDealtStat = damageDealt[i];

        let type = header_types[i];
        let total;
        if (type == 0) {
          total = damageDealtStat - damageTakenStat;
        } else {
          total = damageDealtStat + damageTakenStat;
        }
        // the three stats for each damage column
        row.push(damageTakenStat);
        row.push(damageDealtStat);
        row.push(total);
      }
    };

    // Helper function for adding a row to the `rows` 2d array
    let addRow = (colEntry: any, index: number) => {
      let alliance_ids = colEntry.alliance_ids;
      let alliance_names = colEntry.alliance_names;
      let nation_ids = colEntry.nation_ids;
      let nation_names = colEntry.nation_names;
      let nation_aas = colEntry.nation_aa;
      let damage = colEntry.damage;
      // Handle the different layout types
      switch (type) {
        case Layout.COALITION:
          // Use formatCol (coalition) for the name (index = 0)
          cell_format["formatCol"] = [0];
          let row = [index];
          addStats2Row(row, damage[0], damage[1]);
          rows.push(row);
          break;
        case Layout.ALLIANCE: {
          // use formatAA (alliance) for the name (index = 0)
          cell_format["formatAA"] = [0];
          let o = 2;
          for (let i = 0; i < alliance_ids.length; i++) {
            let row = [];
            let alliance_id = alliance_ids[i];
            let alliance_name = formatAllianceName(
              alliance_names[i],
              alliance_id,
            );
            row.push([alliance_name, alliance_id]);
            addStats2Row(row, damage[i * 2 + o], damage[i * 2 + o + 1]);
            rows.push(row);
          }
          break;
        }
        case Layout.NATION: {
          // use formatNation for the name (index = 0)
          cell_format["formatNation"] = [0];
          let o = 2 + alliance_ids.length * 2;
          for (let i = 0; i < nation_ids.length; i++) {
            let row = [];
            let nation_id = nation_ids[i];
            let nation_name = nation_names[i];
            let nation_aa = nation_aas[i];
            row.push([nation_name, nation_id, nation_aa]);
            addStats2Row(row, damage[i * 2 + o], damage[i * 2 + o + 1]);
            rows.push(row);
          }
          break;
        }
      }
    };
    // Add the rows to the `rows` 2d array - calls the above helper functions
    for (let i = 0; i < coalitions.length; i++) {
      let colEntry = coalitions[i];
      addRow(colEntry, i);
    }
    // Setup the table
    _currentRowData = {
      columns: columns,
      data: rows,
      visible: visible,
      searchable: searchable,
      cell_format: cell_format,
      row_format: row_format,
      sort: sort,
    };
    const tableContainer = document.getElementById("conflict-table-1");
    setupContainer(tableContainer as HTMLElement, _currentRowData);
  }

  // Set the current layout (called on page load)
  function loadLayoutFromQuery(query: URLSearchParams) {
    let layout = query.get("layout");
    if (layout) {
      if (layout === "coalition") {
        _layoutData.layout = Layout.COALITION;
      } else if (layout === "alliance" || layout === "1") {
        _layoutData.layout = Layout.ALLIANCE;
      } else if (layout === "nation" || layout === "2") {
        _layoutData.layout = Layout.NATION;
      }
    }
    let sort = query.get("sort");
    if (sort) {
      _layoutData.sort = sort;
    }
    let order = query.get("order");
    if (order) {
      _layoutData.order = order;
    }
    let columns = query.get("columns");
    if (columns) {
      // split by .
      _layoutData.columns = columns.split(".");
    }
  }

  // Create (or recreate) the table based on the current layout (_layoutData)
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

  // Load the conflict data from the S3 bucket
  // setColNames sets the `namesByAllianceId` global var - which is used for formatting the alliance names in the coalition modal (A popup when you click the coalition button in the table)
  // Load the current layout (which will create the table)
  // If there are posts, load the posts into the timeline
  function setupConflictTables(conflictId: string) {
    _loadError = null;
    _loaded = false;
    let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/${conflictId}.gzip?${config.version.conflict_data}`;
    decompressBson(url)
      .then((data: Conflict) => {
        const loadedData = data;
        _rawData = loadedData;
        datasetProvenance = formatDatasetProvenance(
          config.version.conflict_data,
          (loadedData as any).update_ms,
        );
        setColNames(
          loadedData.coalitions[0].alliance_ids,
          loadedData.coalitions[0].alliance_names,
        );
        setColNames(
          loadedData.coalitions[1].alliance_ids,
          loadedData.coalitions[1].alliance_names,
        );
        loadCurrentLayout();
        if (loadedData.posts && Object.keys(loadedData.posts).length) {
          loadPosts(loadedData.posts);
        }
        _loaded = true;
        saveCurrentQueryParams();
      })
      .catch((error) => {
        console.error("Failed to load conflict data", error);
        _loadError = "Could not load conflict data. Please try again later.";
        _loaded = true;
      });
  }

  // Global var for the alliance names (used for formatting the alliance names in the coalition modal)
  let namesByAllianceId: { [key: number]: string } = {};
  function setColNames(ids: number[], names: string[]) {
    for (let i = 0; i < ids.length; i++) {
      namesByAllianceId[ids[i]] = formatAllianceName(names[i], ids[i]);
    }
  }

  // Runs on component load (svelte) i.e. page load
  // - Sets the format functions
  // - Read query string into layout (loadLayoutFromQuery)
  // - Create the conflict tables (setupConflictTables)
  onMount(() => {
    applySavedQueryParamsIfMissing(
      ["layout", "sort", "order", "columns"],
      ["id"],
    );
    // Add the cell format functions to the window object
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

    // Cell format function for a nation
    (window as any).formatNation = (
      data: any,
      _type: any,
      _row: any,
      _meta: any,
    ) => {
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

    // Cell format function for a nation
    (window as any).formatAA = (
      data: any,
      _type: any,
      _row: any,
      _meta: any,
    ) => {
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

    // Cell format function for a coalition
    (window as any).formatCol = (
      data: any,
      _type: any,
      _row: any,
      _meta: any,
    ) => {
      let index = data; //row.name;
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

    // Read the query string to get the conflict id as well as the table layout (if present)
    let queryParams = new URLSearchParams(window.location.search);
    loadLayoutFromQuery(queryParams);
    const id = queryParams.get("id");
    if (id) {
      conflictId = id;
      // Create the table for the conflict id
      setupConflictTables(conflictId);
    } else {
      _loadError = "Missing conflict id in URL";
      _loaded = true;
    }
  });

  // Handle the layout button clicks
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
    resetQueryParams(["layout", "sort", "order", "columns"], ["id"]);
    setQueryParam("layout", _layoutData.layout, { replace: true });
    setQueryParam("sort", _layoutData.sort, { replace: true });
    setQueryParam("order", _layoutData.order, { replace: true });
    setQueryParam("columns", _layoutData.columns.join("."), { replace: true });
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
      console.log("Initializing timeline");
      // DOM element where the Timeline will be attached
      const container = document.getElementById("visualization");

      if (!container) return;
      if (container.hasChildNodes()) {
        container.innerHTML = "";
      }

      // Create a DataSet (allows two way data-binding)
      const vis = getVis();
      const items = new vis.DataSet();

      // Loop through the posts and add them to the DataSet
      for (const key in postsData) {
        const post = postsData[key];
        const id = post[0];
        const url = `https://forum.politicsandwar.com/index.php?/topic/${id}-${post[1]}`;
        const timestamp = post[2];

        // Convert the timestamp to a Date object
        const date = new Date(timestamp);

        // Add the post to the DataSet
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
        // Set the initial start-end range to display in the timeline
        start: start,
        end: end,
        // Height of timeline canvas
        height: "75vh",
        // Width of timeline canvas
        width: "100%",
        // clickToUse: true,
        zoomKey: "ctrlKey",
        // Which side to put the dates
        orientation: "top",
        // Enable vertical scrolling
        verticalScroll: true,
        // zoomable: false,
      };

      // Create a Timeline
      const timeline = new vis.Timeline(container, items, options);
      // Add red bar at the start and end dates
      timeline.addCustomTime(start, "t1");
      timeline.addCustomTime(end, "t2");
    }
  }

  function loadPosts(posts: { [key: string]: [number, string, number] }) {
    postsData = posts;
    dataLoaded = true;
    console.log("Posts loaded");
    initializeTimeline();
  }

  function onScriptLoad(event: Event) {
    console.log("Script loaded");
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
    <!-- Link the wiki (if it exists) -->
    {#if _rawData?.wiki}
      <a
        class="btn ux-btn fw-bold"
        href="https://politicsandwar.fandom.com/wiki/{_rawData.wiki}"
        >Wiki:{_rawData?.wiki}&nbsp;<i class="bi bi-box-arrow-up-right"></i></a
      >
    {/if}
  </h1>
  <hr class="mt-2 mb-2" />
  <ConflictRouteTabs
    {conflictId}
    mode="layout-picker"
    currentLayout={_layoutData.layout}
    active="coalition"
    onLayoutSelect={handleClick}
  />
  <ul class="nav fw-bold nav-pills nav-fill m-0 p-2 ux-surface mb-3">
    <li>Layout Picker:</li>
    {#each Object.keys(layouts) as key}
      <li>
        <button
          class="btn ux-btn btn-sm ms-1 fw-bold {_layoutData.columns ===
          layouts[key].columns
            ? 'active'
            : ''}"
          on:click={() => {
            // Set the layout variable and recreate the table
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
    <li class="ms-auto d-flex gap-1 justify-content-end">
      <ShareResetBar onReset={resetFilters} />
    </li>
  </ul>
  {#if !_loaded}
    <Progress />
  {/if}
  {#if _loadError}
    <div
      class="alert alert-danger m-2 d-flex justify-content-between align-items-center"
    >
      <span>{_loadError}</span>
      <button class="btn btn-sm btn-outline-danger fw-bold" on:click={retryLoad}
        >Retry</button
      >
    </div>
  {/if}
  <div id="conflict-table-1"></div>
  <!-- If coalition layout, then display the CB and Status -->
  {#if _layoutData.layout == Layout.COALITION}
    <hr />
    <div class="row m-0">
      {#if _rawData?.cb}
        <div class="col-md-6 col-sm-12">
          <div class="col-md-12 ms-2 p-2 rounded border ux-surface">
            <h3>Casus Belli</h3>
            <pre>
                {_rawData?.cb}
            </pre>
          </div>
        </div>
      {/if}
      {#if _rawData?.status}
        <div class="col-md-6 col-sm-12">
          <div class="col-md-12 ms-2 p-2 rounded border ux-surface">
            <h3>Status</h3>
            <pre>
                {_rawData?.status}
            </pre>
          </div>
        </div>
      {/if}
    </div>
  {/if}
  <hr />
  <!-- The date range title -->
  <div class="ux-surface p-2">
    <h4>
      {formatDate(_rawData?.start ?? null)} - {formatDate(
        _rawData?.end ?? null,
      )}
    </h4>
    <!-- Empty div used for the timeline (vis.js) -->
    <div class="m-0" id="visualization"></div>
  </div>
  {#if datasetProvenance}
    <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
  {/if}
</div>
