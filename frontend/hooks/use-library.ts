"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import {
  addSessionToFolder,
  createFolder,
  deleteFolder,
  hydrateLibraryFromStorage,
  loadLibrarySnapshot,
  moveSession,
  removeFile,
  removeSession,
  renameFolder,
  serverLibraryState,
  subscribeLibrary,
  syncLibraryFromDocuments,
  toggleFolderCollapsed,
  upsertFile,
  upsertSession,
} from "@/lib/library/storage";
import type { LibrarySession } from "@/lib/library/types";

export function useLibrary() {
  useEffect(() => {
    hydrateLibraryFromStorage();
  }, []);

  const state = useSyncExternalStore(subscribeLibrary, loadLibrarySnapshot, serverLibraryState);

  const unfiledSessions = useMemo(
    () => state.sessions.filter((session) => !session.folderId),
    [state.sessions],
  );

  const sessionsByFolder = useMemo(() => {
    const map = new Map<string, LibrarySession[]>();
    for (const folder of state.folders) map.set(folder.id, []);
    for (const session of state.sessions) {
      if (!session.folderId) continue;
      const list = map.get(session.folderId);
      if (list) list.push(session);
    }
    return map;
  }, [state.folders, state.sessions]);

  return {
    state,
    unfiledSessions,
    sessionsByFolder,
    upsertFile: useCallback(upsertFile, []),
    removeFile: useCallback(removeFile, []),
    upsertSession: useCallback(upsertSession, []),
    removeSession: useCallback(removeSession, []),
    moveSession: useCallback(moveSession, []),
    addSessionToFolder: useCallback(addSessionToFolder, []),
    createFolder: useCallback(createFolder, []),
    renameFolder: useCallback(renameFolder, []),
    deleteFolder: useCallback(deleteFolder, []),
    toggleFolderCollapsed: useCallback(toggleFolderCollapsed, []),
    syncLibraryFromDocuments: useCallback(syncLibraryFromDocuments, []),
  };
}
