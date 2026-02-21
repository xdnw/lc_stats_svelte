import type { SelectionId, SelectionModalItem } from "../components/selectionModalTypes";

type CoalitionAllianceShape = {
  alliance_ids?: Array<number | string> | Record<string, number | string>;
  alliance_names?: Array<string | null | undefined> | Record<string, string | null | undefined>;
  name?: string;
};

function toArray<T>(value: Array<T> | Record<string, T> | null | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return Object.values(value);
}

export function toNumberSelection(ids: SelectionId[]): number[] {
  return ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
}

export function firstSelectedString(ids: SelectionId[]): string | null {
  if (ids.length === 0) return null;
  const first = `${ids[0] ?? ""}`.trim();
  return first.length > 0 ? first : null;
}

export function validateSingleSelection(
  ids: SelectionId[],
  label: string,
): string | null {
  return ids.length === 1 ? null : `Select exactly one ${label}.`;
}

export function buildStringSelectionItems(values: string[]): SelectionModalItem[] {
  return values.map((value) => ({
    id: value,
    label: value,
  }));
}

export function buildCoalitionAllianceItems(
  coalitions: CoalitionAllianceShape[],
  formatAllianceName: (name: string, id: number) => string,
): SelectionModalItem[] {
  const items: SelectionModalItem[] = [];
  for (const coalition of coalitions ?? []) {
    const allianceIds = toArray(coalition?.alliance_ids)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const allianceNames = toArray(coalition?.alliance_names);
    const coalitionName = `${coalition?.name ?? "Coalition"}`;

    allianceIds.forEach((id, index) => {
      items.push({
        id,
        label: formatAllianceName(`${allianceNames[index] ?? ""}`, id),
        group: coalitionName,
      });
    });
  }
  return items;
}

export function validateAtLeastOnePerCoalition(
  ids: SelectionId[],
  coalitions: Array<{ alliance_ids: number[] }>,
): string | null {
  const selected = new Set(toNumberSelection(ids));
  const everyCoalitionHasSelection = coalitions.every((coalition) =>
    coalition.alliance_ids.some((id) => selected.has(id)),
  );
  return everyCoalitionHasSelection
    ? null
    : "Keep at least one alliance selected in each coalition.";
}
