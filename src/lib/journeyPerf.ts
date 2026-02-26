import { startPerfSpan } from "./perf";

type SpanFinish = () => void;

const activeJourneySpans = new Map<string, SpanFinish>();

export function beginJourneySpan(name: string, tags?: Record<string, unknown>): void {
    const existing = activeJourneySpans.get(name);
    if (existing) {
        existing();
    }
    activeJourneySpans.set(name, startPerfSpan(name, tags as any));
}

export function endJourneySpan(name: string): void {
    const finish = activeJourneySpans.get(name);
    if (!finish) return;
    activeJourneySpans.delete(name);
    finish();
}
