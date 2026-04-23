export type SelectionId = string | number;

export type SelectionModalGroupTone =
    | "default"
    | "coalition1"
    | "coalition2";

export type SelectionModalItem = {
    id: SelectionId;
    label: string;
    group?: string;
    groupTone?: SelectionModalGroupTone;
};