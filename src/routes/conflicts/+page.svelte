<script lang="ts">
  import { appConfig as config } from "$lib/appConfig";
  /**
   * This page is for viewing the table of all conflicts
   */
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";
  import Breadcrumbs from "../../components/Breadcrumbs.svelte";
  import ShareResetBar from "../../components/ShareResetBar.svelte";
  import Progress from "../../components/Progress.svelte";
  import SelectionModal from "../../components/SelectionModal.svelte";
  import type {
    SelectionId,
    SelectionModalItem,
  } from "$lib/selection/types";
  import { onDestroy, onMount } from "svelte";
  import { decompressBson } from "$lib/binary";
  import { modalStrWithCloseButton } from "$lib/modals";
  import { setupContainer } from "$lib/containerSetup";
  import { ExportTypes, downloadTableElem } from "$lib/dataExport";
  import {
    getCurrentQueryParams,
    setQueryParam,
    applySavedQueryParamsIfMissing,
    saveCurrentQueryParams,
    resetQueryParams,
  } from "$lib/queryState";
  import {
    MAX_COMPOSITE_CONFLICT_IDS,
    encodeCompositeSelectionIds,
  } from "$lib/conflictIds";
  import {
    formatDatasetProvenance,
    getConflictsIndexUrl,
    getConflictDataUrl,
    getConflictGraphDataUrl,
  } from "$lib/runtime";
  import { formatAllianceName } from "$lib/formatting";
  import { queueRuntimePrefetch, queueUrlPrefetch } from "$lib/prefetchCoordinator";
  import { toNumberSelection } from "$lib/selectionModalHelpers";
  import { scheduleWhenIdle, yieldToMain } from "$lib/misc";
  import { beginJourneySpan, endJourneySpan } from "$lib/journeyPerf";
  import { incrementPerfCounter, startPerfSpan } from "$lib/perf";
  import { ConflictIndex } from "$lib/types";
  import type { TableCallbacks } from "$lib/tableCallbacks";
  import type { JSONValue, RawData, TableData } from "$lib/types";
  import {
    getBootstrapModalInstance,
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
  let visualizationElement: HTMLDivElement | null = null;
  let timelineObserver: IntersectionObserver | null = null;
  let timelineScriptPromise: Promise<void> | null = null;
  let conflictActionClickListener: ((event: MouseEvent) => void) | null = null;
  let guildParam: string | null = null;
  let selectedConflictIds: Set<number> = new Set();
  let selectionMessage: string | null = null;

  const VIS_TIMELINE_SCRIPT_ID = "visjs";
  const VIS_TIMELINE_SCRIPT_SRC =
    "https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js";

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
    return !allAlliancesSelected ||
      !!guildParam ||
      !allCategoriesSelected ||
      selectedConflictIds.size > 0;
  })();

  const getVis = (): any => getVisGlobal();

  function formatConflictUrlCell(
    data: unknown,
    _type: any,
    row: any,
    _meta: any,
  ): string {
    const id = row[ConflictIndex.ID] as number;
    const safeLabel = escapeHtml(`${data}`);
    const conflictUrl = `${base}/conflict?id=${id}`;
    return `<span class='ux-conflict-cell'><a href='${conflictUrl}' class='btn ux-btn btn-sm fw-bold ux-conflict-name-btn' data-conflict-action='open-card-from-name' data-conflict-id='${id}' aria-label='Open conflict details for ${safeLabel}' title='Left click: open card • Middle click/right click: open conflict page'>${safeLabel}</a></span>`;
  }

  function formatPinnedAlliancesCell(
    _data: unknown,
    _type: any,
    row: any,
    _meta: any,
  ): string {
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
    return `<div class='d-flex flex-wrap gap-1'>${chips.join("")}</div>`;
  }

  function downloadConflictsTable(useClipboard: boolean, type: string): void {
    const tableElem = (document.getElementById("conflictTable") as HTMLElement)
      .querySelector("table") as HTMLTableElement;
    downloadTableElem(
      tableElem,
      useClipboard,
      ExportTypes[type as keyof typeof ExportTypes],
    );
  }

  // onMount runs when this component (i.e. the page) is loaded
  // This registers the formatting functions, and then loads the data from s3 and creates the conflict list table
  onMount(() => {
    try {
      applySavedQueryParamsIfMissing(["ids", "guild"]);
      conflictActionClickListener = (event: MouseEvent) => {
        const target = parseConflictActionTarget(event);
        if (!target) return;

        const action = target.dataset.conflictAction;
        const conflictId = parseConflictId(target.dataset.conflictId);
        if (!action) return;

        if (action === "open-card-from-name") {
          if (conflictId == null) return;
          const allowDefault = openConflictCardFromName(event, conflictId);
          if (!allowDefault) stopTableEvent(event);
          return;
        }

        if (action === "open-conflict-page") {
          if (conflictId == null) return;
          const allowDefault = openConflictPageFromCard(event, conflictId);
          if (!allowDefault) stopTableEvent(event);
          return;
        }

        stopTableEvent(event);

        if (action === "open-card") {
          if (conflictId != null) openConflictCard(undefined, conflictId);
          return;
        }

        if (action === "open-coalition") {
          if (conflictId == null) return;
          const index = parseConflictId(target.dataset.conflictIndex);
          if (index == null || (index !== 0 && index !== 1)) return;
          openCoalitionForConflict(
            undefined,
            conflictId,
            index,
            target.dataset.conflictFromCard === "true",
          );
          return;
        }

        if (action === "open-field") {
          if (conflictId == null) return;
          const field = target.dataset.conflictField;
          if (field === "status" || field === "cb" || field === "posts") {
            if (target.dataset.conflictFromCard === "true") {
              openConflictFieldFromCard(undefined, conflictId, field);
            } else {
              openConflictField(undefined, conflictId, field);
            }
          }
          return;
        }

        if (action === "copy-ids") {
          const value = target.dataset.copyValue ?? "";
          copyToClipboard(value);
          return;
        }

      };
      document.addEventListener("click", conflictActionClickListener, true);

      beginJourneySpan("journey.conflicts.dataFetch", {
        version: config.version.conflicts,
      });
      let url = getConflictsIndexUrl(config.version.conflicts);

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

          const compositeMessage = queryParams.get("cmsg");
          if (compositeMessage) {
            selectionMessage = compositeMessage;
            setQueryParam("cmsg", null, { replace: true });
            queryParams = getCurrentQueryParams();
          }

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

          guildParam = queryParams.get("guild");

          await yieldToMain();
          setupConflicts(result);
          _loaded = true;
          saveCurrentQueryParams();
          requestTimelineRender(false);
        })
        .catch((error) => {
          console.error("Failed to load conflicts data", error);
          _loadError = "Could not load conflicts data. Please try again later.";
          _loaded = true;
        })
        .finally(() => {
          endJourneySpan("journey.conflicts.dataFetch");
        });
    } catch (error) {
      console.error("Error reading from S3 bucket:", error);
      _loadError = "Could not load conflicts data. Please try again later.";
    }

    scheduleWhenIdle(() => {
      void ensureTimelineScriptLoaded().then(() => {
        requestTimelineRender(false);
      });
    }, { timeout: 6000, fallbackDelayMs: 1200 });

    if (
      typeof IntersectionObserver !== "undefined" &&
      visualizationElement
    ) {
      timelineObserver = new IntersectionObserver((entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) return;
        requestTimelineRender(false);
        timelineObserver?.disconnect();
        timelineObserver = null;
      }, {
        root: null,
        threshold: 0.15,
      });
      timelineObserver.observe(visualizationElement);
    }
  });

  onDestroy(() => {
    timelineObserver?.disconnect();
    timelineObserver = null;
    if (conflictActionClickListener) {
      document.removeEventListener("click", conflictActionClickListener, true);
      conflictActionClickListener = null;
    }
  });

  function setupConflicts(result: RawData) {
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

    // Apply source filter before category counting so category chips reflect
    // the active source scope and category filtering remains stable.
    const selectedSourceId = guildParam ?? `${currSource[1]}`;
    if (selectedSourceId && selectedSourceId !== "0") {
      rows = rows.filter(
        (row) => `${row[ConflictIndex.SOURCE] ?? "0"}` === selectedSourceId,
      );
    }

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
      onSelectionChange: (selection) => {
        const next = new Set<number>();
        for (const row of selection.selectedRows) {
          const id = Number(row[ConflictIndex.ID]);
          if (Number.isFinite(id)) {
            next.add(id);
          }
        }
        selectedConflictIds = next;
        selectionMessage =
          selectedConflictIds.size > MAX_COMPOSITE_CONFLICT_IDS
            ? `Composite selection is limited to ${MAX_COMPOSITE_CONFLICT_IDS} conflicts.`
            : null;
      },
      sort: sort,
    };

    // Setup the conflicts table
    const tableCallbacks: TableCallbacks = {
      cellFormatters: {
        formatUrl: formatConflictUrlCell,
        formatPinnedAlliances: formatPinnedAlliancesCell,
      },
      actions: {
        download: downloadConflictsTable,
      },
    };

    setupContainer(container as HTMLElement, _currentRowData, tableCallbacks);
  }
  function selectSource(event: Event) {
    const target = event.target as HTMLSelectElement;
    const id = target.value;
    const name = _rawData!.source_names![id];
    currSource = [name, id];
    guildParam = id === "0" ? null : id;
    setQueryParam("guild", id === "0" ? null : id);
    saveCurrentQueryParams();
    setupConflicts(_rawData!);
    requestTimelineRender(true);
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

  function parseConflictActionTarget(event: MouseEvent): HTMLElement | null {
    const path = typeof event.composedPath === "function"
      ? event.composedPath()
      : [];

    for (const node of path) {
      if (!(node instanceof Element)) continue;
      const candidate = node.closest("[data-conflict-action]");
      if (candidate instanceof HTMLElement) {
        return candidate;
      }
    }

    const rawTarget = event.target;
    if (rawTarget instanceof Element) {
      const candidate = rawTarget.closest("[data-conflict-action]");
      if (candidate instanceof HTMLElement) {
        return candidate;
      }
    }

    return null;
  }

  function parseConflictId(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isPlainLeftClick(event?: MouseEvent): boolean {
    return !!event &&
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey;
  }

  function getConflictAlliances(
    conflictName: string,
    index: number,
  ): { alliance_ids: number[]; alliance_names: string[] } | null {
    const coalitionIds = allianceIdsByCoalition[conflictName]?.[index];
    if (!coalitionIds) return null;
    return {
      alliance_ids: coalitionIds,
      alliance_names: coalitionIds.map((id) =>
        formatAllianceName(allianceNameById[id], id)
      ),
    };
  }

  function copyToClipboard(value: string): void {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        alert("Copied to clipboard");
      })
      .catch((error) => {
        alert("Failed to copy to clipboard" + error);
      });
  }

  function openConflictCardFromName(
    event: MouseEvent | undefined,
    conflictId: number,
  ): boolean {
    if (!event) {
      openConflictCard(undefined, conflictId);
      return false;
    }

    event.stopPropagation();
    if (!isPlainLeftClick(event)) {
      return true;
    }

    event.preventDefault();
    openConflictCard(undefined, conflictId);
    return false;
  }

  function openConflictField(
    event: Event | undefined,
    conflictId: number,
    field: "status" | "cb" | "posts",
  ): void {
    stopTableEvent(event);
    const details = conflictDetailsById[conflictId];
    if (!details) return;

    const title = `${details.name} - ${field.toUpperCase()}`;
    modalStrWithCloseButton(
      title,
      buildConflictFieldBody(details, field),
    );
  }

  function openConflictFieldFromCard(
    event: Event | undefined,
    conflictId: number,
    field: "status" | "cb" | "posts",
  ): void {
    stopTableEvent(event);
    const details = conflictDetailsById[conflictId];
    if (!details) return;

    const title = `${details.name} - ${field.toUpperCase()}`;
    modalStrWithCloseButton(
      conflictModalTitleWithBack(title, conflictId),
      buildConflictFieldBody(details, field),
    );
  }

  function openCoalitionForConflict(
    event: Event | undefined,
    conflictId: number,
    index: number,
    fromCard: boolean = false,
  ): void {
    stopTableEvent(event);
    const details = conflictDetailsById[conflictId];
    if (!details) return;

    const coalition = getConflictAlliances(details.name, index);
    if (!coalition) return;

    const alliance_ids = coalition.alliance_ids;
    const ul = document.createElement("ul");
    ul.className = "mb-0";
    for (let i = 0; i < alliance_ids.length; i++) {
      const alliance_id = alliance_ids[i];
      const alliance_name = formatAllianceName(
        coalition.alliance_names[i],
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
    modalBody.innerHTML += `<button class='btn btn-outline-info btn-sm position-absolute top-0 end-0 m-3' data-conflict-action='copy-ids' data-copy-value='${escapeHtml(idsStr)}' aria-label='Copy alliance ids'><i class='bi bi-clipboard'></i></button>`;
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
  }

  function openConflictCard(
    event: Event | undefined,
    conflictId: number,
  ): void {
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
      <a class='btn ux-btn-primary w-100 fw-bold mb-2' href='${conflictUrl}' data-conflict-action='open-conflict-page' data-conflict-id='${conflictId}' aria-label='Open full conflict page for ${safeName}'>Open Conflict Page</a>

      <div class='ux-conflict-popup-actions' role='group' aria-label='Conflict actions'>
        <button type='button' class='btn ux-btn fw-bold' data-conflict-action='open-coalition' data-conflict-id='${conflictId}' data-conflict-index='0' data-conflict-from-card='true' aria-label='Show coalition 1 alliances for ${safeName}'>C1</button>
        <button type='button' class='btn ux-btn fw-bold' data-conflict-action='open-coalition' data-conflict-id='${conflictId}' data-conflict-index='1' data-conflict-from-card='true' aria-label='Show coalition 2 alliances for ${safeName}'>C2</button>
        <button type='button' class='btn ux-btn fw-bold' data-conflict-action='open-field' data-conflict-id='${conflictId}' data-conflict-field='status' data-conflict-from-card='true' ${hasStatus ? "" : "disabled"} aria-label='Open status for ${safeName}'>Status</button>
        <button type='button' class='btn ux-btn fw-bold' data-conflict-action='open-field' data-conflict-id='${conflictId}' data-conflict-field='cb' data-conflict-from-card='true' ${hasCb ? "" : "disabled"} aria-label='Open casus belli for ${safeName}'>CB</button>
        <button type='button' class='btn ux-btn fw-bold' data-conflict-action='open-field' data-conflict-id='${conflictId}' data-conflict-field='posts' data-conflict-from-card='true' ${hasPosts ? "" : "disabled"} aria-label='Open posts for ${safeName}'>Posts</button>
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

    const detailUrl = getConflictDataUrl(
      String(conflictId),
      config.version.conflict_data,
    );
    queueUrlPrefetch(detailUrl, { priority: "high", crossRoute: true });
    const graphUrl = getConflictGraphDataUrl(
      String(conflictId),
      config.version.graph_data,
    );
    queueUrlPrefetch(graphUrl, { priority: "high", crossRoute: true });
    queueRuntimePrefetch("table", {
      priority: "idle",
      crossRoute: true,
    });
  }

  function openConflictPageFromCard(
    event: Event | undefined,
    conflictId: number,
  ): boolean {
    const mouseEvent = event as MouseEvent | undefined;
    if (!isPlainLeftClick(mouseEvent)) {
      incrementPerfCounter("journey.conflicts_to_conflict.navMode", 1, {
        mode: "document-or-new-tab",
      });
      return true;
    }

    stopTableEvent(event);
    const href = `${base}/conflict?id=${conflictId}`;
    beginJourneySpan("journey.conflicts_to_conflict.routeTransition", {
      mode: "spa",
      source: "conflict-card",
      conflictId,
    });
    incrementPerfCounter("journey.conflicts_to_conflict.navMode", 1, {
      mode: "spa",
    });
    const modalElem = document.getElementById("exampleModal");
    const modalInstance = getBootstrapModalInstance(modalElem);
    modalInstance?.hide?.();
    window.setTimeout(() => {
      void goto(href, { keepFocus: true, noScroll: false });
    }, 80);
    return false;
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
    return `<button type='button' class='btn ux-btn btn-sm fw-bold me-2' data-conflict-action='open-card' data-conflict-id='${conflictId}' aria-label='Back to conflict actions for ${safeTitle}' title='Back to actions'><i class='bi bi-arrow-left'></i></button>${safeTitle}`;
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
    setupConflicts(_rawData!);
    requestTimelineRender(true);
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

    setupConflicts(_rawData!);
    requestTimelineRender(true);
  }

  function resetFilters() {
    if (!_rawData) return;
    _allowedAllianceIds = new Set(_rawData.alliance_ids);
    guildParam = null;
    currSource = ["All", 0];
    selectedCategories = new Set();
    selectedConflictIds = new Set();
    selectionMessage = null;
    showAllianceModal = false;
    resetQueryParams(["ids", "guild"]);
    saveCurrentQueryParams();
    setupConflicts(_rawData);
    requestTimelineRender(true);
  }

  function retryLoad() {
    window.location.reload();
  }

  function openCompositeSelection(): void {
    if (selectedConflictIds.size < 2) {
      selectionMessage = "Select at least two conflicts before opening composite view.";
      return;
    }

    if (selectedConflictIds.size > MAX_COMPOSITE_CONFLICT_IDS) {
      selectionMessage = `Composite selection is limited to ${MAX_COMPOSITE_CONFLICT_IDS} conflicts.`;
      return;
    }

    const ids = Array.from(selectedConflictIds)
      .map((id) => String(id))
      .sort((left, right) => {
        const leftAsNumber = Number(left);
        const rightAsNumber = Number(right);
        const leftIsNumeric = Number.isFinite(leftAsNumber);
        const rightIsNumeric = Number.isFinite(rightAsNumber);

        if (leftIsNumeric && rightIsNumeric) {
          return rightAsNumber - leftAsNumber;
        }
        if (leftIsNumeric && !rightIsNumeric) return -1;
        if (!leftIsNumeric && rightIsNumeric) return 1;
        return right.localeCompare(left);
      });
    const encoded = encodeCompositeSelectionIds(ids);
    void goto(`${base}/conflicts/view?ids=${encodeURIComponent(encoded)}`, {
      keepFocus: true,
      noScroll: false,
    });
  }

  function ensureTimelineScriptLoaded(): Promise<void> {
    if (typeof getVis() !== "undefined") {
      return Promise.resolve();
    }
    if (timelineScriptPromise) {
      return timelineScriptPromise;
    }

    const existing = document.getElementById(
      VIS_TIMELINE_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing?.getAttribute("data-loaded") === "true") {
      return Promise.resolve();
    }

    const finishRuntimeSpan = startPerfSpan("journey.conflicts.timeline.runtime", {
      strategy: "intent-visibility",
    });

    timelineScriptPromise = new Promise<void>((resolve, reject) => {
      const script =
        existing ??
        Object.assign(document.createElement("script"), {
          id: VIS_TIMELINE_SCRIPT_ID,
          async: true,
          src: VIS_TIMELINE_SCRIPT_SRC,
        });

      const onLoad = () => {
        script.setAttribute("data-loaded", "true");
        finishRuntimeSpan();
        resolve();
      };

      const onError = () => {
        timelineScriptPromise = null;
        finishRuntimeSpan();
        reject(new Error("Failed to load vis timeline runtime"));
      };

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });

      if (!existing) {
        document.head.appendChild(script);
      }
    });

    return timelineScriptPromise;
  }

  function requestTimelineRender(force: boolean) {
    ensureTimelineScriptLoaded()
      .then(() => {
        initializeTimeline(force);
      })
      .catch((error) => {
        console.error("Failed to initialize timeline runtime", error);
      });
  }

  function initializeTimeline(force: boolean) {
    if (_loaded && _rawData && typeof getVis() !== "undefined") {
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
</script>

<svelte:head>
  <!-- Modify head -->
  <title>Conflicts</title>
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
            class="btn ux-btn fw-bold ux-btn-success"
            href="http://locutus.link/#/command/conflict%20create_temp"
            target="_blank"
            rel="noopener noreferrer">Create Conflict</a
          >
          <a
            class="btn ux-btn fw-bold ux-btn-danger"
            href="https://locutus.link/#/conflicts"
            target="_blank"
            rel="noopener noreferrer">Edit Conflicts</a
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
      <button class="btn ux-btn" on:click={openCompositeSelection}>
        Open composite ({selectedConflictIds.size}/{MAX_COMPOSITE_CONFLICT_IDS})
      </button>
      <ShareResetBar onReset={resetFilters} resetDirty={isResetDirty} />
    </div>
    {#if selectionMessage}
      <div class="alert alert-warning m-2 py-2">{selectionMessage}</div>
    {/if}
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
    <div class="m-0" id="visualization" bind:this={visualizationElement}></div>
  </div>
  {#if datasetProvenance}
    <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
  {/if}
</div>
