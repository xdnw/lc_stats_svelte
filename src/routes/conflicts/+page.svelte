<script lang="ts">
  import "../../styles/conflict-shell.css";
  import "../../styles/conflict-widgets.css";
  import "../../styles/conflict-timeline.css";
  import { appConfig as config } from "$lib/appConfig";
  /**
   * This page is for viewing the table of all conflicts
   */
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";
  import DataGrid from "$lib/grid/DataGrid.svelte";
  import Breadcrumbs from "../../components/Breadcrumbs.svelte";
  import ShareResetBar from "../../components/ShareResetBar.svelte";
  import Progress from "../../components/Progress.svelte";
  import AllianceFilterModal from "../../components/AllianceFilterModal.svelte";
  import type {
    SelectionModalItem,
  } from "$lib/selection/types";
  import { onDestroy, onMount } from "svelte";
  import { decompressBson } from "$lib/binary";
  import { modalStrWithCloseButton } from "$lib/modals";
  import { openConflictCoalitionModal } from "$lib/conflictCoalitionModal";
  import { renderAppIconSvg } from "$lib/icons";
  import {
    decodeQueryParamValue,
    getCurrentQueryParams,
    setQueryParam,
    resetQueryParams,
  } from "$lib/queryState";
  import {
    applySavedQueryParamsIfMissing,
    saveCurrentQueryParams,
  } from "$lib/queryStorage";
  import {
    MAX_COMPOSITE_CONFLICT_IDS,
    encodeCompositeSelectionIds,
  } from "$lib/conflictIds";
  import {
    hasConflictTargetFinderCoalitions,
    type ConflictTargetFinderCoalition,
  } from "$lib/conflictTargetFinder";
  import {
    formatDatasetProvenance,
    getConflictsIndexUrl,
  } from "$lib/runtime";
  import { formatAllianceName } from "$lib/formatting";
  import {
    CONFLICTS_INDEX_GRID_COLUMN_ORDER,
    CONFLICTS_INDEX_GRID_DEFAULT_SORT,
    createConflictsIndexGridProvider,
    getConflictsIndexDefaultVisibleColumnKeys,
    type ConflictsIndexRow,
  } from "$lib/conflictsIndexGrid";
  import {
    createGridQueryStateOverride,
    parseGridQueryState,
    serializeGridQueryState,
  } from "$lib/grid/queryState";
  import type { GridDataProvider, GridQueryState } from "$lib/grid/types";
  import {
    buildAllianceSelectionItems,
  } from "$lib/selectionModalHelpers";
  import { scheduleWhenIdle, yieldToMain } from "$lib/misc";
  import {
    beginJourneySpan,
    endJourneySpan,
    incrementPerfCounter,
    startPerfSpan,
  } from "$lib/perf";
  import { ConflictIndex } from "$lib/types";
  import type { JSONValue, RawData } from "$lib/types";
  import {
    getModalController,
    getVisGlobal,
  } from "$lib/globals";

  type PrefetchArtifactsModule = typeof import("$lib/prefetchArtifactsClient");
  type ConflictTargetFinderModalModule = typeof import("$lib/conflictTargetFinderModal");

  let prefetchArtifactsPromise: Promise<PrefetchArtifactsModule> | null = null;
  let conflictTargetFinderModalPromise: Promise<ConflictTargetFinderModalModule> | null = null;

  function loadPrefetchArtifacts(): Promise<PrefetchArtifactsModule> {
    if (!prefetchArtifactsPromise) {
      prefetchArtifactsPromise = import("$lib/prefetchArtifactsClient");
    }

    return prefetchArtifactsPromise;
  }

  function loadConflictTargetFinderModal(): Promise<ConflictTargetFinderModalModule> {
    if (!conflictTargetFinderModalPromise) {
      conflictTargetFinderModalPromise = import("$lib/conflictTargetFinderModal");
    }

    return conflictTargetFinderModalPromise;
  }

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
  let conflictHoverIntentListener: ((event: Event) => void) | null = null;
  let conflictPointerIntentListener: ((event: PointerEvent) => void) | null = null;
  let guildParam: string | null = null;
  let selectedConflictIds: Set<number> = new Set();
  let selectionMessage: string | null = null;
  let conflictsGridProvider: GridDataProvider | null = null;
  let conflictsGridStateOverride: Partial<GridQueryState> | null = null;
  let conflictsGridResetVersion = 0;

  const VIS_TIMELINE_SCRIPT_ID = "visjs";
  const VIS_TIMELINE_SCRIPT_SRC =
    "https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.min.js";
  const VIS_TIMELINE_STYLE_ID = "visjs-css";
  const VIS_TIMELINE_STYLE_HREF =
    "https://cdnjs.cloudflare.com/ajax/libs/vis-timeline/7.7.3/vis-timeline-graph2d.css";

  function ensureTimelineStylesheet(): void {
    if (typeof document === "undefined") return;
    if (document.getElementById(VIS_TIMELINE_STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = VIS_TIMELINE_STYLE_ID;
    link.rel = "stylesheet";
    link.href = VIS_TIMELINE_STYLE_HREF;
    document.head.appendChild(link);
  }

  let _allowedAllianceIds: Set<number> = new Set();
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
      selectedConflictIds.size > 0 ||
      conflictsGridStateOverride != null;
  })();

  const getVis = (): any => getVisGlobal();

  function createConflictsGridDefaults(showPinnedColumn: boolean): Partial<GridQueryState> {
    return {
      sort: CONFLICTS_INDEX_GRID_DEFAULT_SORT,
      filters: {},
      pageIndex: 0,
      pageSize: 10,
      visibleColumnKeys: getConflictsIndexDefaultVisibleColumnKeys(showPinnedColumn),
      columnOrderKeys: [...CONFLICTS_INDEX_GRID_COLUMN_ORDER],
      expandedRowIds: [],
      selectedRowIds: [],
    };
  }

  function syncConflictsGridQueryState(state: GridQueryState): void {
    const showPinnedColumn =
      _rawData != null && _allowedAllianceIds.size !== _rawData.alliance_ids.length;
    const defaults = createConflictsGridDefaults(showPinnedColumn);
    const nextOverride = createGridQueryStateOverride(state, defaults);
    const nextSerialized = serializeGridQueryState(nextOverride);
    const currentSerialized = serializeGridQueryState(conflictsGridStateOverride);

    if (nextSerialized === currentSerialized) {
      return;
    }

    conflictsGridStateOverride = nextOverride;
    setQueryParam(
      "grid",
      nextSerialized,
      { replace: true },
    );
    saveCurrentQueryParams();
  }

  function handleConflictsGridSelectionChange(
    event: CustomEvent<{ selectedRowIds: Array<string | number> }>,
  ): void {
    const next = new Set<number>();
    for (const rowId of event.detail.selectedRowIds) {
      const id = Number(rowId);
      if (Number.isFinite(id)) {
        next.add(id);
      }
    }
    selectedConflictIds = next;
    selectionMessage =
      selectedConflictIds.size > MAX_COMPOSITE_CONFLICT_IDS
        ? `Composite selection is limited to ${MAX_COMPOSITE_CONFLICT_IDS} conflicts.`
        : null;
  }

  function handleConflictsGridStateChange(
    event: CustomEvent<{ state: GridQueryState }>,
  ): void {
    syncConflictsGridQueryState(event.detail.state);
  }

  function handleConflictsGridCellAction(
    event: CustomEvent<{
      rowId: string | number;
      columnKey: string;
      actionId: string;
      args?: Record<string, string | number | boolean | null>;
    }>,
  ): void {
    const args = event.detail.args ?? {};
    const conflictId = Number(args.conflictId ?? event.detail.rowId);
    if (!Number.isFinite(conflictId)) return;

    if (event.detail.actionId === "open-conflict-card") {
      openConflictCard(undefined, conflictId);
      return;
    }

    if (event.detail.actionId === "open-coalition") {
      const coalitionIndex = Number(args.coalitionIndex);
      if (coalitionIndex === 0 || coalitionIndex === 1) {
        openCoalitionForConflict(undefined, conflictId, coalitionIndex, false);
      }
      return;
    }

    if (event.detail.actionId === "open-field") {
      const field = `${args.field ?? ""}`;
      if (field === "status" || field === "cb" || field === "posts") {
        openConflictField(undefined, conflictId, field);
      }
    }
  }

  // onMount runs when this component (i.e. the page) is loaded
  // This registers the formatting functions, and then loads the data from s3 and creates the conflict list table
  onMount(() => {
    try {
      applySavedQueryParamsIfMissing(["ids", "guild", "grid"]);
      conflictActionClickListener = (event: MouseEvent) => {
        const target = parseConflictActionTarget(event);
        if (!target) return;

        const action = target.dataset.conflictAction;
        if (!action) return;

        const conflictId = parseConflictId(target.dataset.conflictId);
        if (conflictId == null) return;

        if (action === "open-conflict-page") {
          const allowDefault = openConflictPageFromCard(event, conflictId);
          if (!allowDefault) stopTableEvent(event);
          return;
        }

        stopTableEvent(event);

        if (action === "open-card") {
          openByReplacingActiveModal(event, () => {
            openConflictCard(undefined, conflictId);
          });
          return;
        }

        if (action === "open-coalition") {
          const index = parseConflictId(target.dataset.conflictIndex);
          if (index == null || (index !== 0 && index !== 1)) return;
          const fromCard = target.dataset.conflictFromCard === "true";
          if (fromCard) {
            openByReplacingActiveModal(event, () => {
              openCoalitionForConflict(undefined, conflictId, index, true);
            });
          } else {
            openCoalitionForConflict(undefined, conflictId, index, false);
          }
          return;
        }

        if (action === "open-targets") {
          const targetFinderModalModulePromise = loadConflictTargetFinderModal();
          openByReplacingActiveModal(event, () => {
            void openConflictTargetFinderFromCard(
              conflictId,
              targetFinderModalModulePromise,
            );
          });
          return;
        }

        if (action === "open-field") {
          const field = target.dataset.conflictField;
          if (field === "status" || field === "cb" || field === "posts") {
            const fromCard = target.dataset.conflictFromCard === "true";
            if (fromCard) {
              openByReplacingActiveModal(event, () => {
                openConflictFieldFromCard(undefined, conflictId, field);
              });
            } else {
              openConflictField(undefined, conflictId, field);
            }
          }
          return;
        }

      };
      document.addEventListener("click", conflictActionClickListener, true);

      conflictHoverIntentListener = (event: Event) => {
        const target = findConflictPageLinkIntentTarget(event);
        if (!target) return;
        const parsedId = parseConflictId(target.dataset.conflictId);
        if (parsedId == null) return;
        warmConflictPageIntent(
          parsedId,
          event.type === "focusin" ? "focus" : "hover",
        );
      };

      conflictPointerIntentListener = (event: PointerEvent) => {
        const target = findConflictPageLinkIntentTarget(event);
        if (!target) return;
        const parsedId = parseConflictId(target.dataset.conflictId);
        if (parsedId == null) return;
        warmConflictPageIntent(parsedId, "pointerdown");
      };

      document.addEventListener("mouseover", conflictHoverIntentListener, true);
      document.addEventListener("focusin", conflictHoverIntentListener, true);
      document.addEventListener("pointerdown", conflictPointerIntentListener, true);

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
          allianceRows = buildAllianceSelectionItems(
            alliance_ids,
            alliance_names,
            formatAllianceName,
          );

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
          conflictsGridStateOverride = parseGridQueryState(
            decodeQueryParamValue("grid", queryParams.get("grid")),
          );

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
    if (conflictHoverIntentListener) {
      document.removeEventListener("mouseover", conflictHoverIntentListener, true);
      document.removeEventListener("focusin", conflictHoverIntentListener, true);
      conflictHoverIntentListener = null;
    }
    if (conflictPointerIntentListener) {
      document.removeEventListener("pointerdown", conflictPointerIntentListener, true);
      conflictPointerIntentListener = null;
    }
  });

  function setupConflicts(result: RawData) {
    let rows: JSONValue[][] = result.conflicts as JSONValue[][];
    conflictDetailsById = {};
    selectedConflictIds = new Set();
    selectionMessage = null;
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

    const showPinnedColumn =
      _allowedAllianceIds.size !== _rawData?.alliance_ids.length;
    const gridRows: ConflictsIndexRow[] = rows.map((row) => {
      const id = Number(row[ConflictIndex.ID] ?? 0);
      const c1Ids = (row[ConflictIndex.C1_ID] as number[] | undefined) ?? [];
      const c2Ids = (row[ConflictIndex.C2_ID] as number[] | undefined) ?? [];
      const c1Dealt = Number(row[ConflictIndex.C1_DEALT] ?? 0);
      const c2Dealt = Number(row[ConflictIndex.C2_DEALT] ?? 0);
      const total = c1Dealt + c2Dealt;
      const pinned = showPinnedColumn
        ? [
            ...c1Ids
              .filter((aaId) => _allowedAllianceIds.has(aaId))
              .slice(0, 2)
              .map((aaId) => ({
                side: "C1" as const,
                allianceId: aaId,
                name: allianceNameById[aaId] ?? `AA:${aaId}`,
              })),
            ...c2Ids
              .filter((aaId) => _allowedAllianceIds.has(aaId))
              .slice(0, 2)
              .map((aaId) => ({
                side: "C2" as const,
                allianceId: aaId,
                name: allianceNameById[aaId] ?? `AA:${aaId}`,
              })),
          ]
        : [];
      const wikiValue = `${row[ConflictIndex.WIKI] ?? ""}`.trim();
      const wikiUrl =
        wikiValue.length === 0
          ? null
          : /^https?:\/\//i.test(wikiValue)
            ? wikiValue
            : `https://politicsandwar.fandom.com/wiki/${encodeURIComponent(wikiValue)}`;
      const posts = Object.entries(
        (row[ConflictIndex.POSTS] as Record<string, [number, string, number]>) ?? {},
      )
        .map(([title, post]) => ({
          title,
          url: `https://forum.politicsandwar.com/index.php?/topic/${post[0]}-${post[1]}`,
          timestamp: post[2],
        }))
        .sort((left, right) => right.timestamp - left.timestamp);
      const end = Number(row[ConflictIndex.END] ?? -1);

      return {
        id,
        name: `${row[ConflictIndex.NAME] ?? "Unknown conflict"}`,
        c1Name: `${row[ConflictIndex.C1_NAME] ?? "Coalition 1"}`,
        c2Name: `${row[ConflictIndex.C2_NAME] ?? "Coalition 2"}`,
        start: Number(row[ConflictIndex.START] ?? 0),
        end,
        category: `${row[ConflictIndex.CATEGORY] ?? "uncategorized"}`,
        wars: Number(row[ConflictIndex.WARS] ?? 0),
        activeWars: Number(row[ConflictIndex.ACTIVE_WARS] ?? 0),
        c1Dealt,
        c2Dealt,
        total,
        pinned,
        c1Alliances: c1Ids.map((aaId) => ({
          allianceId: aaId,
          name: formatAllianceName(allianceNameById[aaId], aaId),
        })),
        c2Alliances: c2Ids.map((aaId) => ({
          allianceId: aaId,
          name: formatAllianceName(allianceNameById[aaId], aaId),
        })),
        wikiUrl,
        status: (row[ConflictIndex.STATUS] as string | null) ?? null,
        cb: (row[ConflictIndex.CB] as string | null) ?? null,
        posts,
        rowClass:
          end === -1
            ? "ux-conflicts-row-active"
            : end < Date.now() - 432000000
              ? "ux-conflicts-row-ended"
              : "ux-conflicts-row-recent",
      };
    });

    conflictsGridProvider = createConflictsIndexGridProvider({
      rows: gridRows,
      showPinnedColumn,
    });
    conflictsGridResetVersion += 1;
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

  function openByReplacingActiveModal(
    event: Event | undefined,
    openNext: () => void,
  ): void {
    const target = event?.target;
    const targetModal = target instanceof Element
      ? target.closest(".modal")
      : null;
    const modalElem = targetModal ?? document.querySelector(".modal.show") ?? document.querySelector(".modal");
    const modalInstance = getModalController(modalElem);
    if (!modalElem || !modalInstance?.hide) {
      openNext();
      return;
    }

    let opened = false;
    const openOnce = () => {
      if (opened) return;
      opened = true;
      openNext();
    };

    modalElem.addEventListener("hidden.bs.modal", openOnce, { once: true });
    modalInstance.hide();
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

  function findConflictPageLinkIntentTarget(event: Event): HTMLElement | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const element = target.closest(
      '[data-conflict-action="open-conflict-page"][data-conflict-id]',
    );
    return element instanceof HTMLElement ? element : null;
  }

  function warmConflictPageIntent(
    conflictId: number,
    intent: "hover" | "focus" | "pointerdown" | "enter",
  ): void {
    const id = String(conflictId);

    void loadPrefetchArtifacts()
      .then(({ warmConflictRouteArtifacts }) => {
        warmConflictRouteArtifacts(id, {
          priority: "high",
          reasonBase: `conflicts-open-page-${intent}`,
          routeTarget: "/conflict",
          intentStrength: intent,
        });
      })
      .catch((error) => {
        console.warn("Failed to load conflicts prefetch helpers", error);
      });
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

  function buildConflictTargetFinderCoalitions(details: {
    name: string;
    c1Name: string;
    c2Name: string;
  }): [ConflictTargetFinderCoalition, ConflictTargetFinderCoalition] | null {
    const coalition1 = getConflictAlliances(details.name, 0);
    const coalition2 = getConflictAlliances(details.name, 1);
    if (!coalition1 || !coalition2) return null;

    const toAlliances = (coalition: {
      alliance_ids: number[];
      alliance_names: string[];
    }) =>
      coalition.alliance_ids.map((id, index) => ({
        id,
        name: formatAllianceName(coalition.alliance_names[index], id),
      }));

    return [
      {
        label: "C1",
        name: details.c1Name,
        alliances: toAlliances(coalition1),
      },
      {
        label: "C2",
        name: details.c2Name,
        alliances: toAlliances(coalition2),
      },
    ];
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

    openConflictCoalitionModal({
      title: `Coalition ${index + 1}: ${details.name}`,
      titleHtml: fromCard
        ? conflictModalTitleWithBack(
            `Coalition ${index + 1}: ${details.name}`,
            conflictId,
          )
        : undefined,
      alliances: coalition.alliance_ids.map((allianceId, allianceIndex) => ({
        id: allianceId,
        name: formatAllianceName(
          coalition.alliance_names[allianceIndex],
          allianceId,
        ),
      })),
    });
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
    const targetFinderCoalitions = buildConflictTargetFinderCoalitions(details);
    const hasTargetFinder = targetFinderCoalitions
      ? hasConflictTargetFinderCoalitions(targetFinderCoalitions)
      : false;

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

      <button type='button' class='btn ux-btn ux-btn-danger fw-bold w-100 mt-2' data-conflict-action='open-targets' data-conflict-id='${conflictId}' ${hasTargetFinder ? "" : "disabled"} aria-label='Find Locutus targets for ${safeName}'>Find Targets on Locutus</button>

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
  }

  async function openConflictTargetFinderFromCard(
    conflictId: number,
    targetFinderModalModulePromise: Promise<ConflictTargetFinderModalModule> =
      loadConflictTargetFinderModal(),
  ): Promise<void> {
    const details = conflictDetailsById[conflictId];
    if (!details) return;

    const targetFinderCoalitions = buildConflictTargetFinderCoalitions(details);
    if (!targetFinderCoalitions) return;

    try {
      const { openConflictTargetFinderModal } = await targetFinderModalModulePromise;
      openConflictTargetFinderModal({
        title: `Find Targets: ${details.name}`,
        titleHtml: conflictModalTitleWithBack(
          `Find Targets: ${details.name}`,
          conflictId,
        ),
        coalitions: targetFinderCoalitions,
      });
    } catch (error) {
      console.warn("Failed to load conflict target finder modal", error);
      modalStrWithCloseButton(
        conflictModalTitleWithBack(`Find Targets: ${details.name}`, conflictId),
        "<p class='m-0'>Unable to open the target finder right now.</p>",
      );
    }
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
    warmConflictPageIntent(conflictId, "enter");
    beginJourneySpan("journey.conflicts_to_conflict.routeTransition", {
      mode: "spa",
      source: "conflict-card",
      conflictId,
    });
    incrementPerfCounter("journey.conflicts_to_conflict.navMode", 1, {
      mode: "spa",
    });
    const eventTarget = event?.target;
    const modalElem =
      eventTarget instanceof Element
        ? eventTarget.closest(".modal")
        : document.querySelector(".modal.show") ?? document.querySelector(".modal");
    const modalInstance = getModalController(modalElem);
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
    return `<button type='button' class='btn ux-btn btn-sm fw-bold me-2' data-conflict-action='open-card' data-conflict-id='${conflictId}' aria-label='Back to conflict actions for ${safeTitle}' title='Back to actions'>${renderAppIconSvg("arrowLeft")}</button>${safeTitle}`;
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

  function commitAllowedAllianceIds(nextIds: number[]) {
    _allowedAllianceIds = new Set(nextIds);
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
    conflictsGridStateOverride = null;
    resetQueryParams(["ids", "guild", "grid"]);
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
    ensureTimelineStylesheet();
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
      requestAnimationFrame(() => timeline.redraw());
      window.setTimeout(() => timeline.redraw(), 120);
      // Add red bar at the start and end dates
      timeline.addCustomTime(minStart, "t1");
      timeline.addCustomTime(maxEnd, "t2");
    }
  }
</script>

<svelte:head>
  <!-- Modify head -->
  <link rel="preconnect" href={config.data_origin} crossorigin="anonymous" />
  <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin="anonymous" />
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
          <label for="source" class="input-group-text">Source:</label>
          <select
            class="form-select form-select-sm"
            on:change={selectSource}
          >
            <option selected={currSource[1] == 0} value="0">All</option>
            {#each Object.entries(_rawData.source_names) as [id, name]}
              <option value={id} selected={id == currSource[1]}>{name}</option>
            {/each}
          </select>
          <a
            class="btn ux-btn btn-sm"
            href="http://locutus.link/#/command/conflict%20create_temp"
            target="_blank"
            rel="noopener noreferrer">Create Conflict</a
          >
          <a
            class="btn ux-btn btn-sm"
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
        <span class="fw-semibold">Quick filters:</span>
        <span class="ux-muted">Category</span>
        {#each Object.entries(categoryCounts) as [category, count]}
          <button
            class="btn btn-sm ux-filter-chip"
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

    <div class="d-flex flex-wrap gap-1 mb-2 align-items-center ux-compact-controls">
      <AllianceFilterModal
        title="Filter Alliances"
        description="Select alliances to include in conflict filtering. This does not change individual conflict stats."
        items={allianceRows}
        selectedIds={Array.from(_allowedAllianceIds)}
        applyLabel="Apply filter"
        selectedCountLabel="Alliances selected"
        mode="direct"
        buttonLabel={`Filter Alliances (${_allowedAllianceIds.size}/${_rawData.alliance_ids.length})`}
        size="sm"
        on:commit={(event) => commitAllowedAllianceIds(event.detail.ids)}
      />
      <button class="btn ux-btn btn-sm" on:click={openCompositeSelection}>
        Open composite ({selectedConflictIds.size}/{MAX_COMPOSITE_CONFLICT_IDS})
      </button>
      <ShareResetBar onReset={resetFilters} resetDirty={isResetDirty} />
    </div>
    {#if selectionMessage}
      <div class="alert alert-warning m-2 py-2">{selectionMessage}</div>
    {/if}
  {/if}
  {#if conflictsGridProvider}
    <DataGrid
      provider={conflictsGridProvider}
      initialState={conflictsGridStateOverride}
      resetKey={`conflicts:${conflictsGridResetVersion}`}
      exportBaseFileName="conflicts"
      exportDatasetKey="conflicts"
      exportDatasetLabel="Conflicts"
      exportButtonLabel="Export"
      emptyMessage="No conflicts match the current filters."
      loadingMessage="Loading conflicts table..."
      caption="Conflicts index grid"
      on:stateChange={handleConflictsGridStateChange}
      on:selectionChange={handleConflictsGridSelectionChange}
      on:cellAction={handleConflictsGridCellAction}
    />
  {/if}
  <div class="ux-surface p-2 mt-2">
    <h4 class="m-1">Timeline</h4>
    <p class="ps-1 ux-muted">Use ctrl+mousewheel to zoom on PC</p>
    <div class="m-0" id="visualization" bind:this={visualizationElement}></div>
  </div>
  {#if datasetProvenance}
    <div class="small text-muted text-end mt-2">{datasetProvenance}</div>
  {/if}
</div>
