import type { Conflict, TableData } from "./types";
import type {
    ConflictKPIWidget,
    PresetCardKey,
    ScopeSnapshot,
    WidgetEntity,
    WidgetScope,
} from "./kpi";

export type ConflictKpiContext = {
    data: {
        getRawData: () => Conflict | null;
        getEntityTable: (entity: WidgetEntity) => TableData | null;
        getNamesByAllianceId: () => Record<number, string>;
        formatAllianceName: (name: string, allianceId: number) => string;
        formatNationName: (name: string, nationId: number) => string;
    };
    widgets: {
        getWidgets: () => ConflictKPIWidget[];
        setWidgets: (widgets: ConflictKPIWidget[]) => void;
        persistWidgets: (widgets: ConflictKPIWidget[]) => void;
        makeId: (prefix: string) => string;
    };
    selection: {
        hasSelectionForScope: (scope: WidgetScope) => boolean;
        buildSelectionSnapshot: () => ScopeSnapshot;
        scopeLabel: (scope: WidgetScope, snapshot?: ScopeSnapshot) => string;
    };
    presentation: {
        presetCardLabels: Record<PresetCardKey, string>;
        trimHeader: (metric: string) => string;
        getAavaMetricLabel: (metric: string, header: string) => string;
    };
};