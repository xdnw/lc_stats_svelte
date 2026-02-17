<script lang="ts">
  import { config } from "./../+layout";
  /**
   * This page is for viewing the table of all conflicts
   */
  import { base } from "$app/paths";
  import Navbar from "../../components/Navbar.svelte";
  import Progress from "../../components/Progress.svelte";
  import Footer from "../../components/Footer.svelte";
  import { onMount } from "svelte";
  import {
    decompressBson,
    modalStrWithCloseButton,
    setupContainer,
    addFormatters,
    type TableData,
    ExportTypes,
    downloadTableElem,
    type RawData,
    ConflictIndex,
    type JSONValue,
    setQueryParam,
    applySavedQueryParamsIfMissing,
    saveCurrentQueryParams,
    copyShareLink,
    resetQueryParams,
    formatDatasetProvenance,
  } from "$lib";

  let _currentRowData: TableData;
  let _rawData: RawData | null = null;
  let currSource = ["All", 0];
  let _loaded = false;
  let _loadError: string | null = null;
  let datasetProvenance = "";
  let allianceNameById: { [key: number]: string } = {};
  let allianceIdsByCoalition: { [key: string]: number[][] } = {};
  let colNames: { [key: string]: string[] } = {};
  let guildParam: string | null = null;

  let _allowedAllianceIds: Set<number> = new Set();
  let showDiv = false; // State to toggle visibility
  let searchQuery = ""; // State for search input

  const getVis = (): any => (window as any).vis;

  // onMount runs when this component (i.e. the page) is loaded
  // This registers the formatting functions, and then loads the data from s3 and creates the conflict list table
  onMount(() => {
    try {
      applySavedQueryParamsIfMissing(["ids", "guild", "guild_id"]);
      // Add the cell format functions to the window
      addFormatters();

      // These store a map of the alliance and coalition names
      // - Used by the row format function for coloring the rows
      // - Used to create the modal for the coalition alliances

      (window as any).getIds = (
        coalitionName: string,
        index: number,
      ): { alliance_ids: number[]; alliance_names: string[] } => {
        const alliance_ids = allianceIdsByCoalition[coalitionName][index];
        const alliance_names = alliance_ids.map(
          (id) => allianceNameById[id] || "AA:" + id,
        );
        return { alliance_ids, alliance_names };
      };
      // Function to format the url for the conflict name
      // Has a C1 and C2 button for showing coalition alliances modal
      // + the name of the conflict (linking to the conflict page)
      (window as any).formatUrl = (
        data: string,
        _type: any,
        row: any,
        _meta: any,
      ) => {
        let id = row[0];
        let result = `<span class='text-nowrap'>`;
        for (let i = 0; i <= 1; i++) {
          let button = document.createElement("button");
          button.setAttribute("type", "button");
          button.setAttribute("class", "ms-1 btn ux-btn btn-sm fw-bold");
          button.setAttribute("onclick", `showNames('${data}',${i})`);
          button.textContent = "C" + (i + 1);
          result += button.outerHTML;
        }
        result += `&nbsp;<a href="conflict?id=${id}">${data}</a></span>`;
        return result;
      };

      (window as any).download = function download(
        useClipboard: boolean,
        type: string,
      ) {
        downloadTableElem(
          (
            document.getElementById("conflictTable") as HTMLElement
          ).querySelector("table") as HTMLTableElement,
          useClipboard,
          ExportTypes[type as keyof typeof ExportTypes],
        );
      };

      // Url of s3 bucket
      let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/index.gzip?${config.version.conflicts}`;

      decompressBson(url)
        .then((result: RawData) => {
          _loadError = null;
          _rawData = result;
          datasetProvenance = formatDatasetProvenance(
            config.version.conflicts,
            (result as any).update_ms,
          );
          /*
        Result is an object with the following keys:
        alliance_ids: number[]; - array of alliance ids
        alliance_names: string[]; - array of alliance names (corresponding to the alliance_ids array)
        headers: string[]; - array of the column names, currently (by index): (see ConflictIndex type)
        - 0:id
        - 1:name
        - 2:c1_name
        - 3:c2_name
        - 4:start
        - 5:end
        - 6:wars
        - 7:active_wars
        - 8:c1_dealt
        - 9:c2_dealt
        - 10:c1
        - 11:c2
        - 12:wiki
        - 13:status
        - 14:cb
        - 15:posts - not displayed
        - 16:source - not displayed
        - 17:category - displayed
        conflicts: any[][]; - 2D array of the table cell data in the form [row index][column index]
        */
          let alliance_ids = result.alliance_ids;
          let alliance_names = result.alliance_names;
          for (let i = 0; i < alliance_ids.length; i++) {
            allianceNameById[alliance_ids[i]] = alliance_names[i];
          }

          let queryParams = new URLSearchParams(window.location.search);

          const allianceIdsParam = queryParams.get("ids");
          if (allianceIdsParam) {
            for (const id of allianceIdsParam.split(".")) {
              _allowedAllianceIds.add(parseInt(id));
            }
          } else {
            for (let i = 0; i < alliance_ids.length; i++) {
              _allowedAllianceIds.add(alliance_ids[i]);
            }
          }

          guildParam = queryParams.get("guild") || queryParams.get("guild_id");

          setupConflicts(result, guildParam);
          _loaded = true;
          saveCurrentQueryParams();
          initializeTimeline(false);
        })
        .catch((error) => {
          console.error("Failed to load conflicts data", error);
          _loadError = "Could not load conflicts data. Please try again later.";
          _loaded = true;
        });
    } catch (error) {
      console.error("Error reading from S3 bucket:", error);
      _loadError = "Could not load conflicts data. Please try again later.";
    }
  });

  function setupConflicts(result: RawData, setParam: string | null) {
    let columns: string[] = [...(result.headers as string[])];
    let visible: number[] = [
      ConflictIndex.NAME,
      ConflictIndex.C1_NAME,
      ConflictIndex.C2_NAME,
      ConflictIndex.START,
      ConflictIndex.END,
      ConflictIndex.WARS,
      ConflictIndex.ACTIVE_WARS,
      ConflictIndex.C1_DEALT,
      ConflictIndex.C2_DEALT,
      ConflictIndex.CATEGORY,
    ];
    let searchable: number[] = [ConflictIndex.NAME];
    let cell_format: { [key: string]: number[] } = {};
    let sort: [number, string] = [ConflictIndex.END + 1, "desc"];
    let rows: JSONValue[][] = result.conflicts as JSONValue[][];
    if (_allowedAllianceIds.size != _rawData?.alliance_ids.length) {
      rows = rows.filter((row) => {
        const c1_ids: number[] = row[ConflictIndex.C1_ID] as number[];
        const c2_ids: number[] = row[ConflictIndex.C2_ID] as number[];
        return (
          c1_ids.some((id) => _allowedAllianceIds.has(id)) ||
          c2_ids.some((id) => _allowedAllianceIds.has(id))
        );
      });
    }

    let sourceI = columns.indexOf("source");
    let source_sets = result.source_sets!;
    let source_names = result.source_names!;
    let ss = setParam && source_sets ? source_sets[setParam] : null;
    if (ss) {
      currSource = [
        source_names[setParam as string],
        parseFloat(setParam as string),
      ];
      if (!currSource[0]) currSource[0] = setParam + " (None Featured)";
      let allowConflict = function (conflict: any) {
        if (!ss) return true;
        let source = sourceI == -1 ? 0 : conflict[sourceI];
        if (!source || source == 0) return true;
        if (
          ss.includes(source) ||
          parseFloat(setParam as string) == source ||
          conflict[0] == parseInt(setParam as string)
        )
          return true;
        return source == 128;
      };
      rows = rows.filter(allowConflict);
      console.log("Filtered rows", rows.length);
    } else {
      console.log(
        "No source set ",
        setParam,
        source_sets,
        rows.length,
        source_sets,
      );
    }
    // Set the coalition names
    for (let i = 0; i < rows.length; i++) {
      let conflict = rows[i];
      let conName = conflict[ConflictIndex.NAME] as string;
      allianceIdsByCoalition[conName] = [
        conflict[ConflictIndex.C1_ID] as number[],
        conflict[ConflictIndex.C2_ID] as number[],
      ];
      colNames[conName] = [
        conflict[ConflictIndex.C1_NAME] as string,
        conflict[ConflictIndex.C2_NAME] as string,
      ];
    }

    // Add total damage column (as combination of c1_dealt and c2_dealt)
    columns.push("total");
    rows = rows.map((row) => {
      const damage =
        (row[ConflictIndex.C1_DEALT] as number) +
        (row[ConflictIndex.C2_DEALT] as number);
      return [...row, damage];
    });

    // Set the cell format functions to specific columns
    cell_format["formatUrl"] = [ConflictIndex.NAME];
    cell_format["formatNumber"] = [
      ConflictIndex.WARS,
      ConflictIndex.ACTIVE_WARS,
    ];
    cell_format["formatMoney"] = [
      ConflictIndex.C1_DEALT,
      ConflictIndex.C2_DEALT,
      columns.length - 1,
    ];
    cell_format["formatDate"] = [ConflictIndex.START, ConflictIndex.END];

    let container = document.getElementById("conflictTable");
    _currentRowData = {
      columns: columns,
      data: rows,
      visible: visible,
      searchable: searchable,
      cell_format: cell_format,
      row_format: (row: HTMLElement, data: any, _index: number) => {
        // Highlight rows based on the end date (ongoing = warning, ended <5d ago = light, ended = no color)
        let end = data[5];
        if (end == -1) {
          row.classList.add("bg-danger-subtle");
        } else if (end < Date.now() - 432000000) {
          // 432000000 = 5 days in milliseconds
          row.classList.add("bg-light-subtle");
        } else {
          row.classList.add("bg-warning-subtle");
        }
      },
      sort: sort,
    };

    // Setup the conflicts table
    setupContainer(container as HTMLElement, _currentRowData);
  }
  function selectSource(event: Event) {
    const target = event.target as HTMLSelectElement;
    const id = target.value;
    const name = _rawData!.source_names![id];
    currSource = [name, id];
    guildParam = id === "0" ? null : id;
    setQueryParam("guild", id === "0" ? null : id);
    saveCurrentQueryParams();
    setupConflicts(_rawData!, id);
  }

  function setLayoutAlliance(id: number) {
    if (_allowedAllianceIds.has(id)) {
      _allowedAllianceIds.delete(id);
    } else {
      _allowedAllianceIds.add(id);
    }
    recalcAlliances();
  }

  function toggleAlliances() {
    for (let i = 0; i < _rawData!.alliance_ids.length; i++) {
      let id = _rawData!.alliance_ids[i];
      if (_allowedAllianceIds.has(id)) {
        _allowedAllianceIds.delete(id);
      } else {
        _allowedAllianceIds.add(id);
      }
    }
    recalcAlliances();
  }

  function recalcAlliances() {
    _allowedAllianceIds = _allowedAllianceIds;
    setQueryParam("ids", Array.from(_allowedAllianceIds).join("."), {
      replace: true,
    });
    saveCurrentQueryParams();

    setupConflicts(_rawData!, guildParam);
    initializeTimeline(true);
  }

  function resetFilters() {
    if (!_rawData) return;
    _allowedAllianceIds = new Set(_rawData.alliance_ids);
    guildParam = null;
    currSource = ["All", 0];
    searchQuery = "";
    resetQueryParams(["ids", "guild", "guild_id"]);
    saveCurrentQueryParams();
    setupConflicts(_rawData, null);
    initializeTimeline(true);
  }

  function retryLoad() {
    window.location.reload();
  }

  function initializeTimeline(force: boolean) {
    const script = document.getElementById("visjs");
    if (
      _loaded &&
      _rawData &&
      ((script && script.getAttribute("data-loaded")) ||
        typeof getVis() !== "undefined")
    ) {
      // DOM element where the Timeline will be attached
      const container = document.getElementById("visualization");
      if (!container) return;
      if (container.hasChildNodes()) {
        if (!force) return;
        container.innerHTML = "";
      }

      // Create a DataSet (allows two way data-binding)
      const vis = getVis();
      const items = new vis.DataSet();

      let minStart = Date.now();
      let maxEnd = 0;

      console.log("Loading timeline data", _rawData.conflicts.length);
      const filterConflicts =
        _rawData.alliance_ids.length != _allowedAllianceIds.size;

      _rawData.conflicts.forEach((row: JSONValue[]) => {
        if (filterConflicts) {
          if (
            !(row[ConflictIndex.C1_ID] as number[]).some((id) =>
              _allowedAllianceIds.has(id),
            ) &&
            !(row[ConflictIndex.C2_ID] as number[]).some((id) =>
              _allowedAllianceIds.has(id),
            )
          ) {
            return;
          }
        }
        const name = row[ConflictIndex.NAME] as string;
        const start = row[ConflictIndex.START] as number;
        const end = row[ConflictIndex.END] as number;
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, end == -1 ? Date.now() : end);
        const url = `${base}/conflict?id=${row[ConflictIndex.ID]}`;

        items.add({
          id: row[ConflictIndex.ID],
          content: `<a href="${url}" target="_blank" title="${name}">${name}</a>`,
          start: start,
          end: end === -1 ? Date.now() : end,
        });
      });

      const options = {
        // Set the initial start-end range to display in the timeline
        start: minStart,
        end: maxEnd,
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
      timeline.addCustomTime(minStart, "t1");
      timeline.addCustomTime(maxEnd, "t2");
    }
  }

  function onScriptLoad(event: Event) {
    console.log("Script loaded");
    const script = event.target as HTMLScriptElement;
    script.setAttribute("data-loaded", "true");
    initializeTimeline(false);
  }
</script>

<svelte:head>
  <!-- Modify head -->
  <title>Conflicts</title>
  <script
    id="visjs"
    async
    src="https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js"
    on:load={onScriptLoad}
  ></script>
</svelte:head>
<!-- Add navbar component to page  -->
<Navbar />
<!-- Add sidebar component to page -->
<!-- <Sidebar /> -->
<div class="container-fluid p-2" style="min-height: calc(100vh - 203px);">
  <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
    <a href="{base}/" aria-label="Back to home"
      ><i class="bi bi-arrow-left"></i></a
    >
    &nbsp;Conflict
    {#if _rawData && _rawData.source_names}
      <div class="d-inline-block ms-2">
        <div class="input-group ux-inputbar">
          <label for="source" class="fw-bold input-group-text">Source:</label>
          <select
            class="form-select form-select-sm fw-bold"
            on:change={selectSource}
          >
            <option selected={currSource[1] == 0} value="0">All</option>
            {#each Object.entries(_rawData.source_names) as [id, name]}
              <option value={id} selected={id == currSource[1]}>{name}</option>
            {/each}
          </select>
          <button
            class="btn ux-btn fw-bold"
            on:click={() =>
              modalStrWithCloseButton(
                "Create Info",
                `<p>Use the discord bot to run the following command</p>
<p><code>/conflict create_temp</code></p>
<p>Create a temporary conflict between two coalitions
Conflict is not auto updated</p>
<p><b>Arguments:</b><br/>
<code>&lt;col1&gt;</code> - <a href="https://github.com/xdnw/locutus/wiki/arguments#setdballiance">Set</a>
A comma separated list of alliances<br/>
<code>&lt;col2&gt;</code> - <a href="https://github.com/xdnw/locutus/wiki/arguments#setdballiance">Set</a><br/>
<code>&lt;start&gt;</code> - <a href="https://github.com/xdnw/locutus/wiki/arguments#longtimestamp">long[Timestamp]</a>
A unix timestamp, a DMY date or a time difference that will resolve to a timestamp from the current date<br/>
<code>[end]</code> - <a href="https://github.com/xdnw/locutus/wiki/arguments#longtimestamp">Long[Timestamp]</a><br/>
<code>[-g includeGraphs]</code> - <a href="https://github.com/xdnw/locutus/wiki/arguments#boolean">boolean</a></p>
<a class="btn btn-outline-info" href="https://github.com/xdnw/locutus/wiki/conflict_webpage">More info</a>`,
              )}>Create Conflict</button
          >
        </div>
      </div>
    {/if}
  </h1>
  <hr class="mt-2 mb-2" />
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
  {#if _rawData}
    <div class="d-flex gap-1 mb-2">
      <button class="btn ux-btn btn-sm fw-bold" on:click={() => copyShareLink()}
        >Copy share link</button
      >
      <button class="btn ux-btn btn-sm fw-bold" on:click={resetFilters}
        >Reset</button
      >
    </div>
    <!-- Toggle visibility button -->
    <button class="btn ux-btn mb-2" on:click={() => (showDiv = !showDiv)}>
      Filter Alliances&nbsp;<i
        class="bi"
        class:bi-chevron-down={!showDiv}
        class:bi-chevron-up={showDiv}
      ></i>
    </button>
    {#if showDiv}
      <input
        type="text"
        class="form-control mb-2"
        placeholder="Search alliances..."
        bind:value={searchQuery}
      />
      <div class="d-flex justify-content-left align-items-center ms-1">
        <div class="ux-callout mb-2">
          These will toggle the visiblity of conflicts which contain the
          selected alliances. It does NOT affect the individual conflict stats.
        </div>
      </div>
      <div class="ux-surface p-2 mb-2">
        <!-- Toggle all button -->
        <button
          class="btn ux-btn btn-sm ms-1 mb-1"
          on:click={() => toggleAlliances()}
        >
          Toggle All
        </button>
        <br />
        {#each _rawData.alliance_ids as id, index}
          {#if _rawData.alliance_names[index] && _rawData.alliance_names[index]
              .toLowerCase()
              .includes(searchQuery.toLowerCase())}
            <button
              class="btn ux-btn btn-sm ms-1 mb-1"
              class:active={_allowedAllianceIds.has(id)}
              on:click={() => setLayoutAlliance(id)}
            >
              {_rawData.alliance_names[index]}
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
  <div id="conflictTable" class="inline-block"></div>
  {#if datasetProvenance}
    <div class="small text-muted mt-1">{datasetProvenance}</div>
  {/if}
  <div class="ux-surface p-2 mt-2">
    <h4 class="m-1">Timeline</h4>
    <p class="ps-1 ux-muted">Use ctrl+mousewheel to zoom on PC</p>
    <div class="m-0" id="visualization"></div>
  </div>
</div>
<!-- Add footer component to page -->
<Footer />
