import React, { useCallback, useRef } from 'react';
import type { StorageContext } from './storage-context';
import { storageContext } from './storage-context';
import type { Diagram } from '@/lib/domain/diagram';
import type { ChartDBConfig } from '@/lib/domain/config';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import { api } from '@/lib/api/server-storage';

// Server-backed, in-memory storage provider. No browser storage (IndexedDB/localStorage) is used.

function normalizeDiagramDates(d: Diagram): Diagram {
    return {
        ...d,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
    } as Diagram;
}

export const StorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    // In-memory caches
    const diagramsRef = useRef(new Map<string, Diagram>());
    const filtersRef = useRef(new Map<string, DiagramFilter>());
    const configRef = useRef<ChartDBConfig | undefined>(undefined);

    const getCachedOrFetch = useCallback(
        async (id: string): Promise<Diagram | undefined> => {
            const cached = diagramsRef.current.get(id);
            if (cached) return cached;
            try {
                const res = await api.getWorkspace(id);
                const d = normalizeDiagramDates(res.diagram as Diagram);
                diagramsRef.current.set(id, d);
                return d;
            } catch {
                return undefined;
            }
        },
        []
    );

    const persist = useCallback(async (id: string) => {
        const d = diagramsRef.current.get(id);
        if (!d) return;
        await api.updateWorkspace(id, { name: d.name, diagram: d });
    }, []);

    // Config operations (in-memory only)
    const getConfig: StorageContext['getConfig'] = useCallback(async () => {
        return configRef.current;
    }, []);

    const updateConfig: StorageContext['updateConfig'] = useCallback(
        async (config) => {
            configRef.current = {
                ...(configRef.current || { defaultDiagramId: '' }),
                ...config,
            } as ChartDBConfig;
        },
        []
    );

    // Diagram filter operations (in-memory only)
    const getDiagramFilter: StorageContext['getDiagramFilter'] = useCallback(
        async (diagramId) => {
            return filtersRef.current.get(diagramId);
        },
        []
    );

    const updateDiagramFilter: StorageContext['updateDiagramFilter'] =
        useCallback(async (diagramId, filter) => {
            filtersRef.current.set(diagramId, filter);
        }, []);

    const deleteDiagramFilter: StorageContext['deleteDiagramFilter'] =
        useCallback(async (diagramId) => {
            filtersRef.current.delete(diagramId);
        }, []);

    // Helpers to ensure diagram presence
    const requireDiagram = useCallback(
        async (diagramId: string): Promise<Diagram> => {
            const d = await getCachedOrFetch(diagramId);
            if (!d) throw new Error('Diagram not found');
            return d;
        },
        [getCachedOrFetch]
    );

    // Table operations mutate the in-memory diagram then persist to server
    const addTable: StorageContext['addTable'] = useCallback(
        async ({ diagramId, table }) => {
            const d = await requireDiagram(diagramId);
            d.tables = [...(d.tables || []), table];
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const getTable: StorageContext['getTable'] = useCallback(
        async ({ id, diagramId }) => {
            const d = await requireDiagram(diagramId);
            return (d.tables || []).find((t) => t.id === id);
        },
        [requireDiagram]
    );

    const deleteDiagramTables: StorageContext['deleteDiagramTables'] =
        useCallback(
            async (diagramId) => {
                const d = await requireDiagram(diagramId);
                d.tables = [];
                diagramsRef.current.set(diagramId, {
                    ...d,
                    updatedAt: new Date(),
                });
                await persist(diagramId);
            },
            [persist, requireDiagram]
        );

    const updateTable: StorageContext['updateTable'] = useCallback(
        async ({ id, attributes }) => {
            const diagram = Array.from(diagramsRef.current.values()).find(
                (dg) => (dg.tables || []).some((t) => t.id === id)
            );
            if (!diagram) return;
            const d = { ...diagram } as Diagram;
            d.tables = (d.tables || []).map((t) =>
                t.id === id ? { ...t, ...attributes } : t
            );
            diagramsRef.current.set(d.id, { ...d, updatedAt: new Date() });
            await persist(d.id);
        },
        [persist]
    );

    const putTable: StorageContext['putTable'] = useCallback(
        async ({ diagramId, table }) => {
            const d = await requireDiagram(diagramId);
            const exists = (d.tables || []).some((t) => t.id === table.id);
            d.tables = exists
                ? (d.tables || []).map((t) => (t.id === table.id ? table : t))
                : [...(d.tables || []), table];
            diagramsRef.current.set(diagramId, {
                ...d,
                updatedAt: new Date(),
            });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const deleteTable: StorageContext['deleteTable'] = useCallback(
        async ({ id, diagramId }) => {
            const d = await requireDiagram(diagramId);
            d.tables = (d.tables || []).filter((t) => t.id !== id);
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const listTables: StorageContext['listTables'] = useCallback(
        async (diagramId) => {
            const d = await requireDiagram(diagramId);
            return d.tables || [];
        },
        [requireDiagram]
    );

    // Relationship operations
    const addRelationship: StorageContext['addRelationship'] = useCallback(
        async ({ diagramId, relationship }) => {
            const d = await requireDiagram(diagramId);
            d.relationships = [...(d.relationships || []), relationship];
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const deleteDiagramRelationships: StorageContext['deleteDiagramRelationships'] =
        useCallback(
            async (diagramId) => {
                const d = await requireDiagram(diagramId);
                d.relationships = [];
                diagramsRef.current.set(diagramId, {
                    ...d,
                    updatedAt: new Date(),
                });
                await persist(diagramId);
            },
            [persist, requireDiagram]
        );

    const getRelationship: StorageContext['getRelationship'] = useCallback(
        async ({ id, diagramId }) => {
            const d = await requireDiagram(diagramId);
            return (d.relationships || []).find((r) => r.id === id);
        },
        [requireDiagram]
    );

    const updateRelationship: StorageContext['updateRelationship'] =
        useCallback(
            async ({ id, attributes }) => {
                const diagram = Array.from(diagramsRef.current.values()).find(
                    (dg) => (dg.relationships || []).some((r) => r.id === id)
                );
                if (!diagram) return;
                const d = { ...diagram } as Diagram;
                d.relationships = (d.relationships || []).map((r) =>
                    r.id === id ? { ...r, ...attributes } : r
                );
                diagramsRef.current.set(d.id, {
                    ...d,
                    updatedAt: new Date(),
                });
                await persist(d.id);
            },
            [persist]
        );

    const deleteRelationship: StorageContext['deleteRelationship'] =
        useCallback(
            async ({ id, diagramId }) => {
                const d = await requireDiagram(diagramId);
                d.relationships = (d.relationships || []).filter(
                    (r) => r.id !== id
                );
                diagramsRef.current.set(diagramId, {
                    ...d,
                    updatedAt: new Date(),
                });
                await persist(diagramId);
            },
            [persist, requireDiagram]
        );

    const listRelationships: StorageContext['listRelationships'] = useCallback(
        async (diagramId) => {
            const d = await requireDiagram(diagramId);
            return (d.relationships || [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name));
        },
        [requireDiagram]
    );

    // Dependency operations
    const addDependency: StorageContext['addDependency'] = useCallback(
        async ({ diagramId, dependency }) => {
            const d = await requireDiagram(diagramId);
            d.dependencies = [...(d.dependencies || []), dependency];
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const getDependency: StorageContext['getDependency'] = useCallback(
        async ({ diagramId, id }) => {
            const d = await requireDiagram(diagramId);
            return (d.dependencies || []).find((dep) => dep.id === id);
        },
        [requireDiagram]
    );

    const updateDependency: StorageContext['updateDependency'] = useCallback(
        async ({ id, attributes }) => {
            const diagram = Array.from(diagramsRef.current.values()).find(
                (dg) => (dg.dependencies || []).some((dep) => dep.id === id)
            );
            if (!diagram) return;
            const d = { ...diagram } as Diagram;
            d.dependencies = (d.dependencies || []).map((dep) =>
                dep.id === id ? { ...dep, ...attributes } : dep
            );
            diagramsRef.current.set(d.id, { ...d, updatedAt: new Date() });
            await persist(d.id);
        },
        [persist]
    );

    const deleteDependency: StorageContext['deleteDependency'] = useCallback(
        async ({ diagramId, id }) => {
            const d = await requireDiagram(diagramId);
            d.dependencies = (d.dependencies || []).filter(
                (dep) => dep.id !== id
            );
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const listDependencies: StorageContext['listDependencies'] = useCallback(
        async (diagramId) => {
            const d = await requireDiagram(diagramId);
            return d.dependencies || [];
        },
        [requireDiagram]
    );

    const deleteDiagramDependencies: StorageContext['deleteDiagramDependencies'] =
        useCallback(
            async (diagramId) => {
                const d = await requireDiagram(diagramId);
                d.dependencies = [];
                diagramsRef.current.set(diagramId, {
                    ...d,
                    updatedAt: new Date(),
                });
                await persist(diagramId);
            },
            [persist, requireDiagram]
        );

    // Areas operations
    const addArea: StorageContext['addArea'] = useCallback(
        async ({ diagramId, area }) => {
            const d = await requireDiagram(diagramId);
            d.areas = [...(d.areas || []), area];
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const getArea: StorageContext['getArea'] = useCallback(
        async ({ diagramId, id }) => {
            const d = await requireDiagram(diagramId);
            return (d.areas || []).find((a) => a.id === id);
        },
        [requireDiagram]
    );

    const updateArea: StorageContext['updateArea'] = useCallback(
        async ({ id, attributes }) => {
            const diagram = Array.from(diagramsRef.current.values()).find(
                (dg) => (dg.areas || []).some((a) => a.id === id)
            );
            if (!diagram) return;
            const d = { ...diagram } as Diagram;
            d.areas = (d.areas || []).map((a) =>
                a.id === id ? { ...a, ...attributes } : a
            );
            diagramsRef.current.set(d.id, { ...d, updatedAt: new Date() });
            await persist(d.id);
        },
        [persist]
    );

    const deleteArea: StorageContext['deleteArea'] = useCallback(
        async ({ diagramId, id }) => {
            const d = await requireDiagram(diagramId);
            d.areas = (d.areas || []).filter((a) => a.id !== id);
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const listAreas: StorageContext['listAreas'] = useCallback(
        async (diagramId) => {
            const d = await requireDiagram(diagramId);
            return d.areas || [];
        },
        [requireDiagram]
    );

    const deleteDiagramAreas: StorageContext['deleteDiagramAreas'] =
        useCallback(
            async (diagramId) => {
                const d = await requireDiagram(diagramId);
                d.areas = [];
                diagramsRef.current.set(diagramId, {
                    ...d,
                    updatedAt: new Date(),
                });
                await persist(diagramId);
            },
            [persist, requireDiagram]
        );

    // Custom types operations
    const addCustomType: StorageContext['addCustomType'] = useCallback(
        async ({ diagramId, customType }) => {
            const d = await requireDiagram(diagramId);
            d.customTypes = [...(d.customTypes || []), customType];
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const getCustomType: StorageContext['getCustomType'] = useCallback(
        async ({ diagramId, id }) => {
            const d = await requireDiagram(diagramId);
            return (d.customTypes || []).find((ct) => ct.id === id);
        },
        [requireDiagram]
    );

    const updateCustomType: StorageContext['updateCustomType'] = useCallback(
        async ({ id, attributes }) => {
            const diagram = Array.from(diagramsRef.current.values()).find(
                (dg) => (dg.customTypes || []).some((ct) => ct.id === id)
            );
            if (!diagram) return;
            const d = { ...diagram } as Diagram;
            d.customTypes = (d.customTypes || []).map((ct) =>
                ct.id === id ? { ...ct, ...attributes } : ct
            );
            diagramsRef.current.set(d.id, { ...d, updatedAt: new Date() });
            await persist(d.id);
        },
        [persist]
    );

    const deleteCustomType: StorageContext['deleteCustomType'] = useCallback(
        async ({ diagramId, id }) => {
            const d = await requireDiagram(diagramId);
            d.customTypes = (d.customTypes || []).filter((ct) => ct.id !== id);
            diagramsRef.current.set(diagramId, { ...d, updatedAt: new Date() });
            await persist(diagramId);
        },
        [persist, requireDiagram]
    );

    const listCustomTypes: StorageContext['listCustomTypes'] = useCallback(
        async (diagramId) => {
            const d = await requireDiagram(diagramId);
            return (d.customTypes || [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name));
        },
        [requireDiagram]
    );

    const deleteDiagramCustomTypes: StorageContext['deleteDiagramCustomTypes'] =
        useCallback(
            async (diagramId) => {
                const d = await requireDiagram(diagramId);
                d.customTypes = [];
                diagramsRef.current.set(diagramId, {
                    ...d,
                    updatedAt: new Date(),
                });
                await persist(diagramId);
            },
            [persist, requireDiagram]
        );

    // Diagram operations (server backed)
    const addDiagram: StorageContext['addDiagram'] = useCallback(
        async ({ diagram }) => {
            const d = normalizeDiagramDates(diagram);
            diagramsRef.current.set(d.id, d);
            try {
                await api.createWorkspace({
                    id: d.id,
                    name: d.name,
                    diagram: d,
                });
            } catch {
                // If already exists, try updating
                await api.updateWorkspace(d.id, { name: d.name, diagram: d });
            }
        },
        []
    );

    const listDiagrams: StorageContext['listDiagrams'] =
        useCallback(async () => {
            const list = await api.listWorkspaces();
            // Return cached objects when available; otherwise fetch individually
            const results: Diagram[] = [];
            for (const w of list) {
                let d = diagramsRef.current.get(w.id);
                if (!d) {
                    try {
                        const full = await api.getWorkspace(w.id);
                        d = normalizeDiagramDates(full.diagram as Diagram);
                        diagramsRef.current.set(w.id, d);
                    } catch {
                        continue;
                    }
                }
                results.push(d);
            }
            return results;
        }, []);
    const getDiagram: StorageContext['getDiagram'] = useCallback(
        async (id) => {
            return await getCachedOrFetch(id);
        },
        [getCachedOrFetch]
    );

    const updateDiagram: StorageContext['updateDiagram'] = useCallback(
        async ({ id, attributes }) => {
            const d0 = await getCachedOrFetch(id);
            if (!d0) return;
            const d = {
                ...(d0 as Diagram),
                ...attributes,
                updatedAt: new Date(),
            } as Diagram;
            diagramsRef.current.set(d.id, d);
            await persist(d.id);
        },
        [getCachedOrFetch, persist]
    );

    const deleteDiagram: StorageContext['deleteDiagram'] = useCallback(
        async (id) => {
            // No server DELETE endpoint available; remove from cache only.
            diagramsRef.current.delete(id);
        },
        []
    );

    const applyServerWorkspaceUpdate: StorageContext['applyServerWorkspaceUpdate'] =
        useCallback(
            async ({ id, name, diagram, updatedAt }) => {
                const current = await getCachedOrFetch(id);
                if (!current && !diagram) return; // nothing to apply
                if (diagram) {
                    const d = normalizeDiagramDates(diagram as Diagram);
                    diagramsRef.current.set(id, d);
                    return;
                }
                if (current) {
                    const d = { ...current } as Diagram;
                    if (name !== undefined) d.name = name;
                    if (updatedAt !== undefined)
                        d.updatedAt = new Date(updatedAt);
                    diagramsRef.current.set(id, d);
                }
            },
            [getCachedOrFetch]
        );

    // Initial preload of workspaces for logged-in user (optional)
    React.useEffect(() => {
        (async () => {
            try {
                const session = await api.session();
                if (!session?.user) return;
                const list = await api.listWorkspaces();
                for (const w of list) {
                    try {
                        const full = await api.getWorkspace(w.id);
                        const d = normalizeDiagramDates(
                            full.diagram as Diagram
                        );
                        diagramsRef.current.set(w.id, d);
                    } catch {
                        // ignore
                    }
                }
            } catch {
                // ignore
            }
        })();
    }, []);

    return (
        <storageContext.Provider
            value={{
                // Config
                getConfig,
                updateConfig,
                // Real-time
                applyServerWorkspaceUpdate,
                // Filters
                getDiagramFilter,
                updateDiagramFilter,
                deleteDiagramFilter,
                // Diagrams
                addDiagram,
                listDiagrams,
                getDiagram,
                updateDiagram,
                deleteDiagram,
                // Tables
                addTable,
                getTable,
                updateTable,
                putTable,
                deleteTable,
                listTables,
                deleteDiagramTables,
                // Relationships
                addRelationship,
                getRelationship,
                updateRelationship,
                deleteRelationship,
                listRelationships,
                deleteDiagramRelationships,
                // Dependencies
                addDependency,
                getDependency,
                updateDependency,
                deleteDependency,
                listDependencies,
                deleteDiagramDependencies,
                // Areas
                addArea,
                getArea,
                updateArea,
                deleteArea,
                listAreas,
                deleteDiagramAreas,
                // Custom types
                addCustomType,
                getCustomType,
                updateCustomType,
                deleteCustomType,
                listCustomTypes,
                deleteDiagramCustomTypes,
            }}
        >
            {children}
        </storageContext.Provider>
    );
};
