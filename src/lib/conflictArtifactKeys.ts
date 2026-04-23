import { appConfig as config } from "./appConfig";

export type ConflictArtifactSubject =
    | {
        kind: "conflict";
        id: string;
    }
    | {
        kind: "composite";
        id: string;
    };

export function buildConflictArtifactRegistryKey(
    subject: ConflictArtifactSubject,
    version: string | number,
): string {
    return `${subject.kind}:${subject.id}:v${String(version)}`;
}

export function buildConflictPayloadArtifactKey(
    conflictId: string,
    version: string | number = config.version.conflict_data,
): string {
    return `payload:conflict:${buildConflictArtifactRegistryKey({ kind: "conflict", id: conflictId }, version)}`;
}

export function buildConflictGraphPayloadArtifactKey(
    conflictId: string,
    version: string | number = config.version.graph_data,
): string {
    return `payload:graph:${buildConflictArtifactRegistryKey({ kind: "conflict", id: conflictId }, version)}`;
}
