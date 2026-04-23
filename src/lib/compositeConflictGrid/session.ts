import { createLocalCompositeConflictGridSession } from "./localSession";
import { createWorkerCompositeConflictGridSession, shouldFallbackCompositeConflictGridWorker } from "./workerSession";
import type {
    CompositeConflictGridClient,
    CompositeConflictGridSession,
} from "./types";

export function createCompositeConflictGridSession(options: {
    signature: string;
    conflictIds: string[];
    version: string;
}): CompositeConflictGridSession {
    let fallbackSession: CompositeConflictGridSession | null = null;

    function getFallbackSession(): CompositeConflictGridSession {
        if (!fallbackSession) {
            fallbackSession = createLocalCompositeConflictGridSession(options);
        }
        return fallbackSession;
    }

    let activeSession: CompositeConflictGridSession;
    try {
        activeSession = createWorkerCompositeConflictGridSession(options);
    } catch (error) {
        if (!shouldFallbackCompositeConflictGridWorker(error)) {
            throw error;
        }
        activeSession = getFallbackSession();
    }

    async function withSessionFallback<T>(
        run: (session: CompositeConflictGridSession) => Promise<T>,
    ): Promise<T> {
        try {
            return await run(activeSession);
        } catch (error) {
            if (!shouldFallbackCompositeConflictGridWorker(error)) {
                throw error;
            }
            if (activeSession !== fallbackSession) {
                activeSession.destroy();
                activeSession = getFallbackSession();
            }
            return run(activeSession);
        }
    }

    function createClient(selectedAllianceId: number): CompositeConflictGridClient {
        let activeClient = activeSession.createClient(selectedAllianceId);
        let released = false;

        function ensureOwned(): void {
            if (released) {
                throw new Error("Composite conflict grid client has been released.");
            }
        }

        async function withClientFallback<T>(
            run: (client: CompositeConflictGridClient) => Promise<T>,
        ): Promise<T> {
            ensureOwned();
            try {
                return await run(activeClient);
            } catch (error) {
                if (!shouldFallbackCompositeConflictGridWorker(error)) {
                    throw error;
                }
                if (activeSession !== fallbackSession) {
                    activeSession.destroy();
                    activeSession = getFallbackSession();
                }
                activeClient.destroy();
                activeClient = activeSession.createClient(selectedAllianceId);
                return run(activeClient);
            }
        }

        return {
            get conflictId() {
                return activeClient.conflictId;
            },
            get datasetRef() {
                return activeClient.datasetRef;
            },
            bootstrap(layout) {
                return withClientFallback((client) => client.bootstrap(layout));
            },
            query(layout, state) {
                return withClientFallback((client) => client.query(layout, state));
            },
            querySummary(layout, state) {
                return withClientFallback((client) =>
                    client.querySummary(layout, state),
                );
            },
            getRowDetails(layout, rowId, state) {
                return withClientFallback((client) =>
                    client.getRowDetails(layout, rowId, state),
                );
            },
            getFilteredRowIds(layout, state) {
                return withClientFallback((client) =>
                    client.getFilteredRowIds(layout, state),
                );
            },
            exportRows(layout, state) {
                return withClientFallback((client) =>
                    client.exportRows(layout, state),
                );
            },
            prewarmLayouts(layouts, aggressive) {
                return withClientFallback((client) =>
                    client.prewarmLayouts(layouts, aggressive),
                );
            },
            destroy() {
                if (released) return;
                released = true;
                activeClient.destroy();
            },
        };
    }

    return {
        resolve() {
            return withSessionFallback((session) => session.resolve());
        },
        createClient,
        destroy() {
            activeSession.destroy();
            if (fallbackSession && fallbackSession !== activeSession) {
                fallbackSession.destroy();
            }
        },
    };
}
