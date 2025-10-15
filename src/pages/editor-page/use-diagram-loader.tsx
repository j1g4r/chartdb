import { useChartDB } from '@/hooks/use-chartdb';
import { useConfig } from '@/hooks/use-config';
import { useDialog } from '@/hooks/use-dialog';
import { useFullScreenLoader } from '@/hooks/use-full-screen-spinner';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import { useStorage } from '@/hooks/use-storage';
// Using global `io` from Socket.IO script served by the server at /socket.io/socket.io.js
// to avoid bundling issues in Vite build.
// Minimal Socket type to satisfy TypeScript without the package types.
type Socket = {
    emit: (event: string, ...args: unknown[]) => void;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    off: (event: string, cb: (...args: unknown[]) => void) => void;
    disconnect: () => void;
};
import { API_BASE } from '@/lib/api/server-storage';
import type { Diagram } from '@/lib/domain/diagram';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const useDiagramLoader = () => {
    const [initialDiagram, setInitialDiagram] = useState<Diagram | undefined>();
    const { diagramId } = useParams<{ diagramId: string }>();
    const { config } = useConfig();
    const { loadDiagram, currentDiagram } = useChartDB();
    const { resetRedoStack, resetUndoStack } = useRedoUndoStack();
    const { showLoader, hideLoader } = useFullScreenLoader();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();
    const navigate = useNavigate();
    const { listDiagrams, applyServerWorkspaceUpdate } = useStorage();

    const currentDiagramLoadingRef = useRef<string | undefined>(undefined);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!config) {
            return;
        }

        if (currentDiagram?.id === diagramId) {
            return;
        }

        const loadDefaultDiagram = async () => {
            if (diagramId) {
                setInitialDiagram(undefined);
                showLoader();
                resetRedoStack();
                resetUndoStack();
                const diagram = await loadDiagram(diagramId);
                if (!diagram) {
                    openOpenDiagramDialog({ canClose: false });
                    hideLoader();
                    return;
                }

                setInitialDiagram(diagram);
                hideLoader();

                return;
            } else if (!diagramId && config.defaultDiagramId) {
                const diagram = await loadDiagram(config.defaultDiagramId);
                if (diagram) {
                    navigate(`/diagrams/${config.defaultDiagramId}`);

                    return;
                }
            }
            const diagrams = await listDiagrams();

            if (diagrams.length > 0) {
                openOpenDiagramDialog({ canClose: false });
            } else {
                openCreateDiagramDialog();
            }
        };

        if (
            currentDiagramLoadingRef.current === (diagramId ?? '') &&
            currentDiagramLoadingRef.current !== undefined
        ) {
            return;
        }
        currentDiagramLoadingRef.current = diagramId ?? '';

        loadDefaultDiagram();
    }, [
        diagramId,
        openCreateDiagramDialog,
        config,
        navigate,
        listDiagrams,
        loadDiagram,
        resetRedoStack,
        resetUndoStack,
        hideLoader,
        showLoader,
        currentDiagram?.id,
        openOpenDiagramDialog,
    ]);

    useEffect(() => {
        if (!diagramId) return;
        const url = API_BASE || window.location.origin;
        const wio = (
            window as unknown as {
                io?: (url: string, opts?: unknown) => Socket;
            }
        ).io;
        if (!wio) return;
        const socket = wio(url, { withCredentials: true });
        socketRef.current = socket;
        socket.emit('workspace:join', diagramId);
        const onUpdate = async (payload: {
            id: string;
            name?: string;
            diagram?: unknown;
            updatedAt?: string;
        }) => {
            if (!payload?.id || payload.id !== diagramId) return;
            await applyServerWorkspaceUpdate({
                id: payload.id,
                name: payload.name,
                diagram: payload.diagram as Diagram,
                updatedAt: payload.updatedAt,
            });
        };
        socket.on('workspace:update', onUpdate);
        return () => {
            socket.emit('workspace:leave', diagramId);
            socket.off('workspace:update', onUpdate);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [diagramId, applyServerWorkspaceUpdate]);

    return { initialDiagram };
};
