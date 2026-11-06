import { beforeEach, describe, expect, it } from "vitest";

import {
  addSessionToFolder,
  createFolder,
  deleteFolder,
  hydrateLibraryFromStorage,
  loadLibraryState,
  moveSession,
  removeFile,
  resetLibraryCache,
  syncLibraryFromDocuments,
  upsertFile,
  upsertSession,
} from "@/lib/library/storage";

describe("library storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetLibraryCache();
    hydrateLibraryFromStorage();
  });

  it("keeps unfiled sessions under chats and nests sessions in folders", () => {
    upsertSession({ documentId: "doc-1", title: "Brief A" });
    upsertSession({ documentId: "doc-2", title: "Brief B" });
    const folder = createFolder("Research");
    moveSession("doc-2", folder.id);

    const state = loadLibraryState();
    expect(state.sessions.filter((session) => !session.folderId)).toHaveLength(1);
    expect(state.sessions.find((session) => session.documentId === "doc-2")?.folderId).toBe(
      folder.id,
    );
  });

  it("returns sessions to chats when a folder is deleted", () => {
    upsertSession({ documentId: "doc-3", title: "Notes" });
    const folder = createFolder("Archive");
    moveSession("doc-3", folder.id);
    deleteFolder(folder.id);

    const state = loadLibraryState();
    expect(state.folders).toHaveLength(0);
    expect(state.sessions[0]?.folderId).toBeNull();
  });

  it("stores uploaded files in library and can delete them", () => {
    upsertFile({
      documentId: "doc-4",
      title: "spec.pdf",
      size: 1200,
      mimeType: "application/pdf",
    });
    upsertSession({ documentId: "doc-4", title: "spec.pdf" });
    removeFile("doc-4");

    const state = loadLibraryState();
    expect(state.files).toHaveLength(0);
    expect(state.sessions).toHaveLength(0);
  });

  it("adds a library file into a folder as a session", () => {
    upsertFile({
      documentId: "doc-5",
      title: "notes.md",
      size: 40,
      mimeType: "text/markdown",
    });
    const folder = createFolder("Projects");
    addSessionToFolder("doc-5", folder.id);

    const state = loadLibraryState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]?.folderId).toBe(folder.id);
  });

  it("preserves folder assignment while syncing documents", () => {
    upsertFile({ documentId: "doc-6", title: "Old", size: 1, mimeType: "text/plain" });
    upsertSession({ documentId: "doc-6", title: "Old" });
    const folder = createFolder("Projects");
    moveSession("doc-6", folder.id);
    syncLibraryFromDocuments([
      { id: "doc-6", fileName: "Updated.pdf", size: 99, mimeType: "application/pdf" },
    ]);

    const state = loadLibraryState();
    expect(state.files[0]?.title).toBe("Updated.pdf");
    expect(state.sessions[0]?.folderId).toBe(folder.id);
  });
});
