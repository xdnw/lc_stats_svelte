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
  } from "$lib";

  let _currentRowData: TableData;
  let _rawData: RawData | null = null;
  let currSource = ["All", 0];
  let _loaded = false;
  let allianceNameById: { [key: number]: string } = {};
  let allianceIdsByCoalition: { [key: string]: number[][] } = {};
  let colNames: { [key: string]: string[] } = {};

  // onMount runs when this component (i.e. the page) is loaded
  // This registers the formatting functions, and then loads the data from s3 and creates the conflict list table
  onMount(() => {
    try {
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
        type: any,
        row: any,
        meta: any,
      ) => {
        let id = row[0];
        let result = `<span class='text-nowrap'>`;
        for (let i = 0; i <= 1; i++) {
          let button = document.createElement("button");
          button.setAttribute("type", "button");
          button.setAttribute(
            "class",
            "ms-1 btn btn-outline-info btn-secondary btn-sm fw-bold opacity-75",
          );
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

      decompressBson(url).then((result: RawData) => {
        _rawData = result;
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
        conflicts: any[][]; - 2D array of the table cell data in the form [row index][column index]
        */
        let alliance_ids = result.alliance_ids;
        let alliance_names = result.alliance_names;
        for (let i = 0; i < alliance_ids.length; i++) {
          allianceNameById[alliance_ids[i]] = alliance_names[i];
        }

        let queryParams = new URLSearchParams(window.location.search);
        let setParam = queryParams.get("guild");

        setupConflicts(result, setParam);
        _loaded = true;
        initializeTimeline();
      });
    } catch (error) {
      console.error("Error reading from S3 bucket:", error);
    }
  });

  function setupConflicts(result: RawData, setParam: string | null) {
    let columns: string[] = result.headers as string[];
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
    ];
    let searchable: number[] = [1];
    let cell_format: { [key: string]: number[] } = {};
    let sort: [number, string] = [ConflictIndex.END, "desc"];
    let rows: any[][] = result.conflicts as any[][];

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
      let conName = conflict[1];
      allianceIdsByCoalition[conName] = [
        conflict[ConflictIndex.C1_ID],
        conflict[ConflictIndex.C2_ID],
      ];
      colNames[conName] = [
        conflict[ConflictIndex.C1_NAME],
        conflict[ConflictIndex.C2_NAME],
      ];
    }

    // Add total damage column (as combination of c1_dealt and c2_dealt)
    columns.push("total");
    for (let i in rows) {
      let damage =
        rows[i][ConflictIndex.C1_DEALT] + rows[i][ConflictIndex.C2_DEALT];
      rows[i].push(damage);
    }

    // Set the cell format functions to specific columns
    cell_format["formatUrl"] = [ConflictIndex.NAME];
    cell_format["formatNumber"] = [
      ConflictIndex.WARS,
      ConflictIndex.ACTIVE_WARS,
    ];
    cell_format["formatMoney"] = [
      ConflictIndex.C1_DEALT,
      ConflictIndex.C2_DEALT,
      ConflictIndex.TOTAL,
    ];
    cell_format["formatDate"] = [ConflictIndex.START, ConflictIndex.END];

    let container = document.getElementById("conflictTable");
    _currentRowData = {
      columns: columns,
      data: rows,
      visible: visible,
      searchable: searchable,
      cell_format: cell_format,
      row_format: (row: HTMLElement, data: number[], index: number) => {
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
    setupConflicts(_rawData!, id);
  }

  function initializeTimeline() {
    const script = document.getElementById("visjs");
    if (
      _loaded &&
      _rawData &&
      ((script && script.getAttribute("data-loaded")) ||
        typeof vis !== "undefined")
    ) {
      // DOM element where the Timeline will be attached
      const container = document.getElementById("visualization");
      if (!container || container.hasChildNodes()) return;

      // Create a DataSet (allows two way data-binding)
      const items = new vis.DataSet();

      let minStart = Date.now();
      let maxEnd = 0;

      console.log("Loading timeline data", _rawData.conflicts.length);

      _rawData.conflicts.forEach((row: JSONValue[]) => {
        // get the conflict name, start date, and end date
        // url should match the one in the table
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
    initializeTimeline();
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
<div class="container-fluid m-0 p-0" style="min-height: calc(100vh - 203px);">
  <h1 class="m-1">
    <a href="{base}/"><i class="bi bi-arrow-left"></i></a>
    <div class="d-inline-block" style="position: relative; bottom: -0.1em;">
      &nbsp;Conflict
    </div>
    {#if _rawData && _rawData.source_names}
      <div class="d-inline-block">
        <div class="input-group">
          <label for="source" class="fw-bold input-group-text border-3"
            >Source:</label
          >
          <select
            class="p-0 btn btn-sm border-border border-3 border-light bg-light-subtle text-info fw-bold"
            on:change={selectSource}
          >
            <option selected={currSource[1] == 0} value="0">All</option>
            {#each Object.entries(_rawData.source_names) as [id, name]}
              <option value={id} selected={id == currSource[1]}>{name}</option>
            {/each}
          </select>
          <button
            class="btn btn-outline-light border-3 fw-bold text-info"
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
  <hr class="mt-1" />
  {#if !_loaded}
    <Progress />
  {/if}
  <div id="conflictTable"></div>
  <h4 class="m-1">Timeline</h4>
  <div class="m-0" id="visualization"></div>
</div>
<!-- Add footer component to page -->
<Footer />
