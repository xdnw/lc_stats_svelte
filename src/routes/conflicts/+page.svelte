<script lang="ts">
  import { config } from "./../+layout";
  /**
   * This page is for viewing the table of all conflicts
   */
  import { base } from "$app/paths";
  import Breadcrumbs from "../../components/Breadcrumbs.svelte";
  import ShareResetBar from "../../components/ShareResetBar.svelte";
  import Progress from "../../components/Progress.svelte";
  import SelectionModal from "../../components/SelectionModal.svelte";
  import type {
    SelectionId,
    SelectionModalItem,
  } from "../../components/selectionModalTypes";
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
    getCurrentQueryParams,
    setQueryParam,
    applySavedQueryParamsIfMissing,
    saveCurrentQueryParams,
    resetQueryParams,
    formatDatasetProvenance,
    formatAllianceName,
    getConflictDataUrl,
    getConflictGraphDataUrl,
    toNumberSelection,
    yieldToMain,
  } from "$lib";
  import {
    getBootstrapModalInstance,
    getWindowGlobal,
    setWindowGlobal,
    getVisGlobal,
  } from "$lib/globals";

  let _currentRowData: TableData;
  let _rawData: RawData | null = null;
  let currSource = ["All", 0];
  let _loaded = false;
  let _loadError: string | null = null;
  let datasetProvenance = "";
  let allianceNameById: { [key: number]: string } = {};
  let allianceIdsByCoalition: { [key: string]: number[][] } = {};
  let colNames: { [key: string]: string[] } = {};
  let conflictDetailsById: {
    [key: number]: {
      name: string;
      c1Name: string;
      c2Name: string;
      category: string;
      start: number;
      end: number;
      wars: number;
      activeWars: number;
      c1Dealt: number;
      c2Dealt: number;
      totalDealt: number;
      pinnedInfo: string | null;
      wiki: string | null;
      status: string | null;
      cb: string | null;
      posts: any;
    };
  } = {};
  let timelineRows: JSONValue[][] = [];
  let guildParam: string | null = null;

  let _allowedAllianceIds: Set<number> = new Set();
  let showAllianceModal = false;
  let allianceRows: SelectionModalItem[] = [];

  let categoryCounts: { [key: string]: number } = {};
  let selectedCategories: Set<string> = new Set();
  $: isResetDirty = (() => {
    if (!_rawData) return false;
    const allAlliancesSelected =
      _allowedAllianceIds.size === _rawData.alliance_ids.length;
    const categories = Object.keys(categoryCounts);
    const allCategoriesSelected =
      selectedCategories.size === categories.length &&
      categories.every((category) => selectedCategories.has(category));
    return !allAlliancesSelected || !!guildParam || !allCategoriesSelected;
  })();

  const getVis = (): any => getVisGlobal();

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

      setWindowGlobal(
        "getIds",
        (
          coalitionName: string,
          index: number,
        ): { alliance_ids: number[]; alliance_names: string[] } => {
          const alliance_ids = allianceIdsByCoalition[coalitionName][index];
          const alliance_names = alliance_ids.map((id) =>
            formatAllianceName(allianceNameById[id], id),
          );
          return { alliance_ids, alliance_names };
        },
      );
      // Function to format the url for the conflict name
      // Has a C1 and C2 button for showing coalition alliances modal
      // + the name of the conflict (linking to the conflict page)
      setWindowGlobal(
        "formatUrl",
        (data: string, _type: any, row: any, _meta: any) => {
          const id = row[ConflictIndex.ID] as number;
          const safeLabel = escapeHtml(`${data}`);
          const conflictUrl = `${base}/conflict?id=${id}`;
          return `<span class='ux-conflict-cell'><a href='${conflictUrl}' class='btn ux-btn btn-sm fw-bold ux-conflict-name-btn' onclick='return openConflictCardFromName(event,${id})' aria-label='Open conflict details for ${safeLabel}' title='Left click: open card • Middle click/right click: open conflict page'>${safeLabel}</a></span>`;
        },
      );

      setWindowGlobal(
        "openConflictCardFromName",
        (event: MouseEvent | undefined, conflictId: number) => {
          if (!event) {
            const openConflictCard =
              getWindowGlobal<
                (event: Event | undefined, conflictId: number) => void
              >("openConflictCard");
            openConflictCard?.(undefined, conflictId);
            return false;
          }

          event.stopPropagation();

          const isPlainLeftClick =
            event.button === 0 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.altKey;

          if (!isPlainLeftClick) {
            return true;
          }

          event.preventDefault();
          const openConflictCard =
            getWindowGlobal<
              (event: Event | undefined, conflictId: number) => void
            >("openConflictCard");
          openConflictCard?.(undefined, conflictId);
          return false;
        },
      );

      setWindowGlobal(
        "download",
        function download(useClipboard: boolean, type: string) {
          downloadTableElem(
            (
              document.getElementById("conflictTable") as HTMLElement
            ).querySelector("table") as HTMLTableElement,
            useClipboard,
            ExportTypes[type as keyof typeof ExportTypes],
          );
        },
      );

      setWindowGlobal(
        "openConflictField",
        (
          event: Event | undefined,
          conflictId: number,
          field: "status" | "cb" | "posts",
        ) => {
          stopTableEvent(event);
          const details = conflictDetailsById[conflictId];
          if (!details) return;

          const title = `${details.name} - ${field.toUpperCase()}`;
          modalStrWithCloseButton(
            title,
            buildConflictFieldBody(details, field),
          );
        },
      );

      setWindowGlobal(
        "openConflictFieldFromCard",
        (
          event: Event | undefined,
          conflictId: number,
          field: "status" | "cb" | "posts",
        ) => {
          stopTableEvent(event);
          const details = conflictDetailsById[conflictId];
          if (!details) return;

          const title = `${details.name} - ${field.toUpperCase()}`;
          modalStrWithCloseButton(
            conflictModalTitleWithBack(title, conflictId),
            buildConflictFieldBody(details, field),
          );
        },
      );

      setWindowGlobal(
        "openCoalitionForConflict",
        (
          event: Event | undefined,
          conflictId: number,
          index: number,
          fromCard: boolean = false,
        ) => {
          stopTableEvent(event);
          const details = conflictDetailsById[conflictId];
          if (!details) return;

          const getIds =
            getWindowGlobal<
              (
                coalitionName: string,
                index: number,
              ) => { alliance_ids: number[]; alliance_names: string[] }
            >("getIds");
          if (!getIds) return;
          const col = getIds(details.name, index);

          const alliance_ids = col.alliance_ids;
          const ul = document.createElement("ul");
          ul.className = "mb-0";
          for (let i = 0; i < alliance_ids.length; i++) {
            const alliance_id = alliance_ids[i];
            const alliance_name = formatAllianceName(
              col.alliance_names[i],
              alliance_id,
            );
            const a = document.createElement("a");
            a.setAttribute(
              "href",
              `https://politicsandwar.com/alliance/id=${alliance_id}`,
            );
            a.setAttribute("target", "_blank");
            a.setAttribute("rel", "noopener noreferrer");
            a.textContent = alliance_name;
            const li = document.createElement("li");
            li.appendChild(a);
            ul.appendChild(li);
          }

          const modalBody = document.createElement("div");
          const idsStr = alliance_ids.join(",");
          const areaElem = document.createElement("kbd");
          areaElem.textContent = idsStr;
          areaElem.setAttribute("readonly", "true");
          areaElem.setAttribute("class", "form-control m-0");
          modalBody.appendChild(areaElem);
          const copyToClipboard = `<button class='btn btn-outline-info btn-sm position-absolute top-0 end-0 m-3' onclick='copyToClipboard("${idsStr}")' aria-label='Copy alliance ids'><i class='bi bi-clipboard'></i></button>`;
          modalBody.innerHTML += copyToClipboard;
          modalBody.appendChild(ul);

          modalStrWithCloseButton(
            fromCard
              ? conflictModalTitleWithBack(
                  `Coalition ${index + 1}: ${details.name}`,
                  conflictId,
                )
              : `Coalition ${index + 1}: ${details.name}`,
            modalBody.outerHTML,
          );
        },
      );

      setWindowGlobal(
        "openConflictCard",
        (event: Event | undefined, conflictId: number) => {
          stopTableEvent(event);
          const details = conflictDetailsById[conflictId];
          if (!details) return;

          const wikiValue = details.wiki ?? "";
          const hasWiki = wikiValue.trim().length > 0;
          const hasStatus = (details.status ?? "").trim().length > 0;
          const hasCb = (details.cb ?? "").trim().length > 0;
          const hasPosts = details.posts && typeof details.posts === "object";
          const wikiUrl = hasWiki ? normalizeWikiUrl(wikiValue) : "#";
          const conflictUrl = `${base}/conflict?id=${conflictId}`;
          const safeName = escapeHtml(details.name);
          const hasPinnedInfo = (details.pinnedInfo ?? "").trim().length > 0;

          const bodyHtml = `
          <a class='btn ux-btn-primary w-100 fw-bold mb-2' href='${conflictUrl}' onclick='openConflictPageFromCard(event,${conflictId})' aria-label='Open full conflict page for ${safeName}'>Open Conflict Page</a>

          <div class='ux-conflict-popup-actions' role='group' aria-label='Conflict actions'>
            <button type='button' class='btn ux-btn fw-bold' onclick='openCoalitionForConflict(event,${conflictId},0,true)' aria-label='Show coalition 1 alliances for ${safeName}'>C1</button>
            <button type='button' class='btn ux-btn fw-bold' onclick='openCoalitionForConflict(event,${conflictId},1,true)' aria-label='Show coalition 2 alliances for ${safeName}'>C2</button>
            <button type='button' class='btn ux-btn fw-bold' onclick='openConflictFieldFromCard(event,${conflictId},"status")' ${hasStatus ? "" : "disabled"} aria-label='Open status for ${safeName}'>Status</button>
            <button type='button' class='btn ux-btn fw-bold' onclick='openConflictFieldFromCard(event,${conflictId},"cb")' ${hasCb ? "" : "disabled"} aria-label='Open casus belli for ${safeName}'>CB</button>
            <button type='button' class='btn ux-btn fw-bold' onclick='openConflictFieldFromCard(event,${conflictId},"posts")' ${hasPosts ? "" : "disabled"} aria-label='Open posts for ${safeName}'>Posts</button>
            <a class='btn ux-btn fw-bold' href='${wikiUrl}' ${hasWiki ? "target='_blank' rel='noopener noreferrer'" : "aria-disabled='true' tabindex='-1'"} aria-label='Open wiki for ${safeName} in a new tab'>Wiki</a>
          </div>

          <div class='ux-conflict-popup-meta mt-2' role='group' aria-label='Conflict basic info'>
            <div><span class='ux-muted'>C1:</span> ${escapeHtml(details.c1Name)}</div>
            <div><span class='ux-muted'>C2:</span> ${escapeHtml(details.c2Name)}</div>
            <div><span class='ux-muted'>Category:</span> ${escapeHtml(details.category)}</div>
            <div><span class='ux-muted'>Start:</span> ${escapeHtml(formatConflictDate(details.start))}</div>
            <div><span class='ux-muted'>End:</span> ${escapeHtml(formatConflictDate(details.end))}</div>
            <div><span class='ux-muted'>Wars:</span> ${details.wars}</div>
            <div><span class='ux-muted'>Active wars:</span> ${details.activeWars}</div>
            <div><span class='ux-muted'>C1 dealt:</span> ${escapeHtml(formatConflictMoney(details.c1Dealt))}</div>
            <div><span class='ux-muted'>C2 dealt:</span> ${escapeHtml(formatConflictMoney(details.c2Dealt))}</div>
            <div><span class='ux-muted'>Total dealt:</span> ${escapeHtml(formatConflictMoney(details.totalDealt))}</div>
            ${hasPinnedInfo ? `<div><span class='ux-muted'>Pinned:</span> ${escapeHtml(details.pinnedInfo ?? "")}</div>` : ""}
          </div>
        `;

          modalStrWithCloseButton(`${details.name} Details`, bodyHtml);

          // Prefetch this conflict's data so navigating to it is instant.
          const detailUrl = getConflictDataUrl(
            String(conflictId),
            config.version.conflict_data,
          );
          decompressBson(detailUrl).catch(() => {});
          const graphUrl = getConflictGraphDataUrl(
            String(conflictId),
            config.version.graph_data,
          );
          decompressBson(graphUrl).catch(() => {});
        },
      );

      setWindowGlobal(
        "openConflictPageFromCard",
        (event: Event | undefined, conflictId: number) => {
          stopTableEvent(event);
          const modalElem = document.getElementById("exampleModal");
          const modalInstance = getBootstrapModalInstance(modalElem);
          modalInstance?.hide?.();
          window.setTimeout(() => {
            window.location.href = `${base}/conflict?id=${conflictId}`;
          }, 80);
        },
      );

      setWindowGlobal(
        "formatPinnedAlliances",
        (_data: any, _type: any, row: any, _meta: any) => {
          if (_allowedAllianceIds.size === _rawData?.alliance_ids.length) {
            return "";
          }
          const c1_ids = row[ConflictIndex.C1_ID] as number[];
          const c2_ids = row[ConflictIndex.C2_ID] as number[];

          const c1 = c1_ids.filter((id) => _allowedAllianceIds.has(id));
          const c2 = c2_ids.filter((id) => _allowedAllianceIds.has(id));
          const total = c1.length + c2.length;

          if (total === 0) return "<span class='ux-muted'>-</span>";

          let chips: string[] = [];
          const pushChip = (ids: number[], side: string, cls: string) => {
            for (const id of ids) {
              if (chips.length >= 4) return;
              const name = allianceNameById[id] ?? `AA:${id}`;
              chips.push(
                `<span class='badge ${cls}' title='${side}: ${name}'>${side}:${name}</span>`,
              );
            }
          };

          pushChip(c1, "C1", "text-bg-primary");
          pushChip(c2, "C2", "text-bg-danger");
          if (total > chips.length) {
            chips.push(
              `<span class='badge text-bg-secondary'>+${total - chips.length}</span>`,
            );
          }
          return `<span class='d-inline-flex flex-wrap gap-1'>${chips.join("")}</span>`;
        },
      );

      // Url of s3 bucket
      let url = `https://locutus.s3.ap-southeast-2.amazonaws.com/conflicts/index.gzip?${config.version.conflicts}`;

      decompressBson(url)
        .then(async (result: RawData) => {
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
            allianceNameById[alliance_ids[i]] = formatAllianceName(
              alliance_names[i],
              alliance_ids[i],
            );
          }
          allianceRows = alliance_ids.map((id, index) => ({
            id,
            label: formatAllianceName(alliance_names[index], id),
          }));

          let queryParams = getCurrentQueryParams();

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

          await yieldToMain();
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
    let searchable: number[] = [
      ConflictIndex.NAME,
      ConflictIndex.CATEGORY,
      ConflictIndex.C1_NAME,
      ConflictIndex.C2_NAME,
    ];
    let cell_format: { [key: string]: number[] } = {};
    let sort: [number, string] = [ConflictIndex.END + 1, "desc"];
    let rows: JSONValue[][] = result.conflicts as JSONValue[][];
    conflictDetailsById = {};
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
    }

    // Build quick filter counts and preserve selection where possible
    categoryCounts = {};
    for (const row of rows) {
      const category = `${row[ConflictIndex.CATEGORY] ?? "uncategorized"}`;
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    }

    if (selectedCategories.size === 0) {
      selectedCategories = new Set(Object.keys(categoryCounts));
    } else {
      selectedCategories = new Set(
        [...selectedCategories].filter((cat) => categoryCounts[cat] != null),
      );
      if (selectedCategories.size === 0) {
        selectedCategories = new Set(Object.keys(categoryCounts));
      }
    }

    rows = rows.filter((row) => {
      const category = `${row[ConflictIndex.CATEGORY] ?? "uncategorized"}`;
      return selectedCategories.has(category);
    });

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
      const id = conflict[ConflictIndex.ID] as number;
      const c1_ids = conflict[ConflictIndex.C1_ID] as number[];
      const c2_ids = conflict[ConflictIndex.C2_ID] as number[];
      const filteredC1Ids = c1_ids.filter((aaId) =>
        _allowedAllianceIds.has(aaId),
      );
      const filteredC2Ids = c2_ids.filter((aaId) =>
        _allowedAllianceIds.has(aaId),
      );
      const c1PinnedNames = filteredC1Ids
        .map((aaId) => allianceNameById[aaId] ?? `AA:${aaId}`)
        .slice(0, 4);
      const c2PinnedNames = filteredC2Ids
        .map((aaId) => allianceNameById[aaId] ?? `AA:${aaId}`)
        .slice(0, 4);
      const showPinnedInfo =
        _allowedAllianceIds.size !== _rawData?.alliance_ids.length;
      const pinnedParts: string[] = [];
      if (showPinnedInfo && c1PinnedNames.length > 0) {
        pinnedParts.push(`C1: ${c1PinnedNames.join(", ")}`);
      }
      if (showPinnedInfo && c2PinnedNames.length > 0) {
        pinnedParts.push(`C2: ${c2PinnedNames.join(", ")}`);
      }
      conflictDetailsById[id] = {
        name: conName,
        c1Name: (conflict[ConflictIndex.C1_NAME] as string) ?? "N/A",
        c2Name: (conflict[ConflictIndex.C2_NAME] as string) ?? "N/A",
        category: `${conflict[ConflictIndex.CATEGORY] ?? "uncategorized"}`,
        start: (conflict[ConflictIndex.START] as number) ?? 0,
        end: (conflict[ConflictIndex.END] as number) ?? -1,
        wars: (conflict[ConflictIndex.WARS] as number) ?? 0,
        activeWars: (conflict[ConflictIndex.ACTIVE_WARS] as number) ?? 0,
        c1Dealt: (conflict[ConflictIndex.C1_DEALT] as number) ?? 0,
        c2Dealt: (conflict[ConflictIndex.C2_DEALT] as number) ?? 0,
        totalDealt:
          ((conflict[ConflictIndex.C1_DEALT] as number) ?? 0) +
          ((conflict[ConflictIndex.C2_DEALT] as number) ?? 0),
        pinnedInfo: pinnedParts.length > 0 ? pinnedParts.join(" | ") : null,
        wiki: (conflict[ConflictIndex.WIKI] as string | null) ?? null,
        status: (conflict[ConflictIndex.STATUS] as string | null) ?? null,
        cb: (conflict[ConflictIndex.CB] as string | null) ?? null,
        posts: conflict[ConflictIndex.POSTS],
      };
    }

    timelineRows = rows;

    // Add total damage column (as combination of c1_dealt and c2_dealt)
    columns.push("total");
    const showPinnedColumn =
      _allowedAllianceIds.size !== _rawData?.alliance_ids.length;
    if (showPinnedColumn) {
      columns.push("pinned");
    }
    rows = rows.map((row) => {
      const damage =
        (row[ConflictIndex.C1_DEALT] as number) +
        (row[ConflictIndex.C2_DEALT] as number);
      if (!showPinnedColumn) {
        return [...row, damage];
      }
      return [...row, damage, ""];
    });

    const pinnedIdx = showPinnedColumn ? columns.length - 1 : -1;
    if (showPinnedColumn) {
      visible.push(pinnedIdx);
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
    if (showPinnedColumn) {
      cell_format["formatPinnedAlliances"] = [pinnedIdx];
    }

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
    initializeTimeline(true);
  }

  function normalizeWikiUrl(wiki: string): string {
    const value = wiki.trim();
    if (!value) return "#";
    if (/^https?:\/\//i.test(value)) return value;
    return `https://politicsandwar.fandom.com/wiki/${encodeURIComponent(value)}`;
  }

  function stopTableEvent(event?: Event) {
    if (!event) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function formatConflictDate(value: number): string {
    if (value === -1) return "Ongoing";
    if (!value || Number.isNaN(value)) return "N/A";
    return new Date(value).toLocaleString();
  }

  function formatConflictMoney(value: number): string {
    if (!value || Number.isNaN(value)) return "$0";
    return `$${Math.round(value).toLocaleString()}`;
  }

  function buildConflictFieldBody(
    details: {
      name: string;
      status: string | null;
      cb: string | null;
      posts: any;
    },
    field: "status" | "cb" | "posts",
  ): string {
    const body = document.createElement("div");

    if (field === "status") {
      body.innerHTML = `<ul class='m-0'><li>${details.status ?? "N/A"}</li></ul>`;
    } else if (field === "cb") {
      body.innerHTML = `<ul class='m-0'><li>${details.cb ?? "N/A"}</li></ul>`;
    } else {
      const posts = details.posts;
      const ul = document.createElement("ul");
      ul.className = "m-0";
      let hasPosts = false;
      if (posts && typeof posts === "object") {
        Object.entries(posts).forEach(([name, value]) => {
          const v = value as any;
          const li = document.createElement("li");
          const postId = Array.isArray(v) ? v[0] : null;
          const postText = Array.isArray(v) ? (v[1] ?? name) : name;
          const postTime = Array.isArray(v) ? v[2] : null;
          if (postId != null) {
            const a = document.createElement("a");
            a.href = `https://forum.politicsandwar.com/index.php?/topic/${postId}`;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = postText;
            li.appendChild(a);
          } else {
            li.textContent = postText;
          }
          if (typeof postTime === "number") {
            const small = document.createElement("small");
            small.className = "text-muted ms-2";
            small.textContent = formatDatasetProvenance("", postTime)
              .replace("Version:  • ", "")
              .replace("Version: ", "");
            li.appendChild(small);
          }
          ul.appendChild(li);
          hasPosts = true;
        });
      }
      if (!hasPosts) {
        body.innerHTML = "<ul class='m-0'><li>No posts available</li></ul>";
      } else {
        body.appendChild(ul);
      }
    }

    return body.outerHTML;
  }

  function conflictModalTitleWithBack(
    title: string,
    conflictId: number,
  ): string {
    const safeTitle = escapeHtml(title);
    return `<button type='button' class='btn ux-btn btn-sm fw-bold me-2' onclick='openConflictCard(undefined,${conflictId})' aria-label='Back to conflict actions for ${safeTitle}' title='Back to actions'><i class='bi bi-arrow-left'></i></button>${safeTitle}`;
  }

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toggleCategory(category: string) {
    const next = new Set(selectedCategories);
    if (next.has(category)) {
      if (next.size === 1) return;
      next.delete(category);
    } else {
      next.add(category);
    }
    selectedCategories = next;
    setupConflicts(_rawData!, guildParam);
    initializeTimeline(true);
  }

  function openAllianceModal() {
    showAllianceModal = true;
  }

  function closeAllianceModal() {
    showAllianceModal = false;
  }

  function applyAllianceModal(event: CustomEvent<{ ids: SelectionId[] }>) {
    const nextIds = toNumberSelection(event.detail.ids);
    if (nextIds.length === 0) return;
    _allowedAllianceIds = new Set(nextIds);
    showAllianceModal = false;
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
    selectedCategories = new Set();
    showAllianceModal = false;
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

      const filterConflicts =
        _rawData.alliance_ids.length != _allowedAllianceIds.size;

      timelineRows.forEach((row: JSONValue[]) => {
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
<div class="container-fluid p-2 ux-page-body">
  <h1 class="m-0 mb-2 p-2 ux-surface ux-page-title">
    <div class="ux-page-title-stack">
      <Breadcrumbs
        items={[{ label: "Home", href: `${base}/` }, { label: "Conflicts" }]}
      />
      <span class="ux-page-title-main">Conflicts</span>
    </div>
    {#if _rawData && _rawData.source_names}
      <div class="d-inline-block ms-auto">
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
          <a
            class="btn ux-btn fw-bold"
            href="http://locutus.link/#/command/conflict%20create_temp"
            target="_blank"
            rel="noopener noreferrer">Create Conflict</a
          >
        </div>
      </div>
    {/if}
  </h1>
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
    <div class="ux-surface p-2 mb-2">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <span class="fw-bold">Quick filters:</span>
        <span class="ux-muted">Category</span>
        {#each Object.entries(categoryCounts) as [category, count]}
          <button
            class="btn btn-sm fw-bold"
            class:ux-btn={selectedCategories.has(category)}
            class:btn-outline-secondary={!selectedCategories.has(category)}
            on:click={() => toggleCategory(category)}
            title="Toggle category"
          >
            {category} <span class="badge text-bg-light ms-1">{count}</span>
          </button>
        {/each}

        {#if _allowedAllianceIds.size !== _rawData.alliance_ids.length}
          <span class="ux-muted ms-2">Pinned alliance badges:</span>
          <span class="badge text-bg-primary">C1</span>
          <span class="badge text-bg-danger">C2</span>
        {/if}
      </div>
    </div>

    <div class="d-flex flex-wrap gap-1 mb-2 align-items-center">
      <button class="btn ux-btn" on:click={openAllianceModal}>
        Filter Alliances ({_allowedAllianceIds.size}/{_rawData.alliance_ids
          .length})
      </button>
      <ShareResetBar onReset={resetFilters} resetDirty={isResetDirty} />
    </div>
    <SelectionModal
      open={showAllianceModal}
      title="Filter Alliances"
      description="Select alliances to include in conflict filtering. This does not change individual conflict stats."
      items={allianceRows}
      selectedIds={Array.from(_allowedAllianceIds)}
      searchPlaceholder="Search alliances..."
      on:close={closeAllianceModal}
      on:apply={applyAllianceModal}
      validateSelection={(ids) =>
        ids.length === 0 ? "Select at least one alliance." : null}
    />
  {/if}
  <div id="conflictTable" class="inline-block"></div>
  <div class="ux-surface p-2 mt-2">
    <h4 class="m-1">Timeline</h4>
    <p class="ps-1 ux-muted">Use ctrl+mousewheel to zoom on PC</p>
    <div class="m-0" id="visualization"></div>
  </div>
  {#if datasetProvenance}
    <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
  {/if}
</div>
