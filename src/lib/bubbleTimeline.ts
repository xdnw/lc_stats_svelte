import {
    buildSliderTickDescriptors,
} from "./sliderTicks";

export type BubbleTimelineTickDescriptor = {
    index: number;
    label: string;
    percent: number;
    anchor: "start" | "center" | "end";
};

export function buildBubbleTimelineTickIndices(
    frameCount: number,
    maxTickCount = 5,
): number[] {
    if (!Number.isFinite(frameCount) || frameCount <= 0) {
        return [];
    }

    if (frameCount === 1) {
        return [0];
    }

    const requestedTicks = Math.max(2, Math.floor(maxTickCount));
    const actualTickCount = Math.min(frameCount, requestedTicks);
    const lastIndex = frameCount - 1;
    const indices = new Set<number>([0, lastIndex]);

    for (let tickIndex = 0; tickIndex < actualTickCount; tickIndex++) {
        const ratio = actualTickCount === 1 ? 0 : tickIndex / (actualTickCount - 1);
        indices.add(Math.round(ratio * lastIndex));
    }

    return Array.from(indices).sort((left, right) => left - right);
}

export function buildBubbleTimelineTicks(
    frameLabels: string[],
    maxTickCount = 5,
): BubbleTimelineTickDescriptor[] {
    if (!Array.isArray(frameLabels) || frameLabels.length === 0) {
        return [];
    }

    return buildSliderTickDescriptors(
        buildBubbleTimelineTickIndices(frameLabels.length, maxTickCount),
        (index) => frameLabels[index] ?? "",
    ).map(({ value, label, percent, anchor }) => ({
        index: value,
        label,
        percent,
        anchor,
    }));
}
