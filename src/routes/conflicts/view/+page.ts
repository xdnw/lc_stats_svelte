import { browser } from "$app/environment";
import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import {
    getCompositeConflictSignature,
    parseCompositeSelectionIds,
} from "$lib/conflictIds";
import {
    warmCompositeContextArtifact,
    warmCompositeDefaultTableArtifact,
} from "$lib/prefetchArtifacts";
import type { PageLoad } from "./$types";

export type CompositePageData = {
    conflictIds: string[];
    invalidTokens: string[];
    limited: boolean;
    signature: string;
    selectedAllianceId: number | null;
};

export const load: PageLoad = ({ url }) => {
    if (!browser) {
    if (!browser) {
        return {
            conflictIds: [],
            invalidTokens: [],
            limited: false,
            selectedAllianceId: null,
            signature: "",
        } satisfies CompositePageData;
    }
        return {
            conflictIds: [],
            invalidTokens: [],
            limited: false,
            signature: "",
            selectedAllianceId: null,
        } satisfies CompositePageData;
    }

    const parsed = parseCompositeSelectionIds(url.searchParams.get("ids"));
    if (parsed.ids.length < 2) {
        throw redirect(
            302,
            `${base}/conflicts?cmsg=${encodeURIComponent("Select at least two conflicts to build a composite conflict.")}`,
        );
    }

    const rawAid = url.searchParams.get("aid")?.trim() ?? "";
    const selectedAllianceId = /^\d+$/.test(rawAid)
        ? Number.parseInt(rawAid, 10)
        : null;

    if (selectedAllianceId != null) {
        warmCompositeContextArtifact({
            ids: parsed.ids,
            aid: selectedAllianceId,
            priority: "high",
            reason: "route-composite-load-context",
            routeTarget: "/conflicts/view",
            intentStrength: "load",
        });
        warmCompositeDefaultTableArtifact({
            ids: parsed.ids,
            aid: selectedAllianceId,
            priority: "high",
            reason: "route-composite-load-default-table",
            routeTarget: "/conflicts/view",
        });
    }

    return {
        conflictIds: parsed.ids,
        invalidTokens: parsed.invalidTokens,
        limited: parsed.limited,
        signature: getCompositeConflictSignature(parsed.ids),
        selectedAllianceId,
    } satisfies CompositePageData;
};
