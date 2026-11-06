import type {
  LibraryFile,
  LibraryFolder,
  LibrarySession,
  LibraryState,
} from "@/lib/library/types";

const STORAGE_KEY = "chatdoc.library.v1";

const listeners = new Set<() => void>();
let snapshot: LibraryState | null = null;
let serverSnapshot: LibraryState | null = null;
let hydrated = false;

function blank(): LibraryState {
  return { files: [], sessions: [], folders: [], collapsedFolderIds: [] };
}

function isFile(value: unknown): value is LibraryFile {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LibraryFile>;
  return (
    typeof record.documentId === "string" &&
    typeof record.title === "string" &&
    typeof record.size === "number" &&
    typeof record.mimeType === "string" &&
    typeof record.updatedAt === "string"
  );
}

function isSession(value: unknown): value is LibrarySession {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LibrarySession>;
  return (
    typeof record.id === "string" &&
    typeof record.documentId === "string" &&
    typeof record.title === "string" &&
    (record.folderId === null || typeof record.folderId === "string") &&
    typeof record.updatedAt === "string"
  );
}

function isFolder(value: unknown): value is LibraryFolder {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LibraryFolder>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.createdAt === "string"
  );
}

function normalize(parsed: Partial<LibraryState>): LibraryState {
  const folders = Array.isArray(parsed.folders) ? parsed.folders.filter(isFolder) : [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  let files = Array.isArray(parsed.files) ? parsed.files.filter(isFile) : [];
  const sessions = (Array.isArray(parsed.sessions) ? parsed.sessions.filter(isSession) : []).map(
    (session) => ({
      ...session,
      folderId: session.folderId && folderIds.has(session.folderId) ? session.folderId : null,
    }),
  );

  // Migrate older saves that only had sessions.
  if (files.length === 0 && sessions.length > 0) {
    files = sessions.map((session) => ({
      documentId: session.documentId,
      title: session.title,
      size: 0,
      mimeType: "application/octet-stream",
      updatedAt: session.updatedAt,
    }));
  }

  const collapsedFolderIds = Array.isArray(parsed.collapsedFolderIds)
    ? parsed.collapsedFolderIds.filter(
        (id): id is string => typeof id === "string" && folderIds.has(id),
      )
    : [];
  return { files, sessions, folders, collapsedFolderIds };
}

export function serverLibraryState(): LibraryState {
  serverSnapshot ??= blank();
  return serverSnapshot;
}

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadLibrarySnapshot(): LibraryState {
  // Keep the first client render identical to the server snapshot to avoid
  // Next.js hydration mismatches (and the red "1 Issue" portal badge).
  if (!hydrated) return serverLibraryState();
  if (!snapshot) snapshot = loadLibraryState();
  return snapshot;
}

export function hydrateLibraryFromStorage(): void {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  snapshot = loadLibraryState();
  listeners.forEach((listener) => listener());
}

export function resetLibraryCache(): void {
  snapshot = null;
  serverSnapshot = null;
  hydrated = typeof window !== "undefined";
}

export function loadLibraryState(): LibraryState {
  if (typeof window === "undefined") return blank();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return blank();
    return normalize(JSON.parse(raw) as Partial<LibraryState>);
  } catch {
    return blank();
  }
}

export function saveLibraryState(state: LibraryState): void {
  snapshot = normalize(state);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }
  listeners.forEach((listener) => listener());
}

function mutate(updater: (current: LibraryState) => LibraryState): LibraryState {
  if (typeof window !== "undefined" && !hydrated) {
    hydrated = true;
    snapshot = loadLibraryState();
  }
  const next = normalize(updater(loadLibrarySnapshot()));
  saveLibraryState(next);
  return next;
}

export function upsertFile(input: {
  documentId: string;
  title: string;
  size?: number;
  mimeType?: string;
  updatedAt?: string;
}): LibraryFile {
  const now = input.updatedAt || new Date().toISOString();
  let result: LibraryFile | null = null;
  mutate((current) => {
    const existing = current.files.find((file) => file.documentId === input.documentId);
    result = existing
      ? {
          ...existing,
          title: input.title || existing.title,
          size: typeof input.size === "number" ? input.size : existing.size,
          mimeType: input.mimeType || existing.mimeType,
          updatedAt: now,
        }
      : {
          documentId: input.documentId,
          title: input.title || "Untitled file",
          size: input.size ?? 0,
          mimeType: input.mimeType || "application/octet-stream",
          updatedAt: now,
        };
    const files = existing
      ? current.files.map((file) => (file.documentId === input.documentId ? result! : file))
      : [result, ...current.files];
    return { ...current, files };
  });
  return result!;
}

export function removeFile(documentId: string): void {
  mutate((current) => ({
    ...current,
    files: current.files.filter((file) => file.documentId !== documentId),
    sessions: current.sessions.filter((session) => session.documentId !== documentId),
  }));
}

export function upsertSession(input: {
  documentId: string;
  title: string;
  folderId?: string | null;
  touch?: boolean;
}): LibrarySession {
  const now = new Date().toISOString();
  let result: LibrarySession | null = null;
  mutate((current) => {
    const existing = current.sessions.find((session) => session.documentId === input.documentId);
    if (existing) {
      result = {
        ...existing,
        title: input.title || existing.title,
        folderId: input.folderId === undefined ? existing.folderId : input.folderId,
        updatedAt: input.touch === false ? existing.updatedAt : now,
      };
      return {
        ...current,
        sessions: current.sessions.map((session) =>
          session.documentId === input.documentId ? result! : session,
        ),
      };
    }
    result = {
      id: input.documentId,
      documentId: input.documentId,
      title: input.title || "Untitled chat",
      folderId: input.folderId ?? null,
      updatedAt: now,
    };
    return { ...current, sessions: [result, ...current.sessions] };
  });
  return result!;
}

export function removeSession(documentId: string): void {
  mutate((current) => ({
    ...current,
    sessions: current.sessions.filter((session) => session.documentId !== documentId),
  }));
}

export function moveSession(documentId: string, folderId: string | null): void {
  mutate((current) => ({
    ...current,
    sessions: current.sessions.map((session) =>
      session.documentId === documentId
        ? { ...session, folderId, updatedAt: new Date().toISOString() }
        : session,
    ),
  }));
}

export function addSessionToFolder(documentId: string, folderId: string, title?: string): void {
  const current = loadLibrarySnapshot();
  const existing = current.sessions.find((session) => session.documentId === documentId);
  if (existing) {
    moveSession(documentId, folderId);
    return;
  }
  const file = current.files.find((item) => item.documentId === documentId);
  upsertSession({
    documentId,
    title: title || file?.title || "Untitled chat",
    folderId,
  });
}

export function createFolder(name: string): LibraryFolder {
  const folder: LibraryFolder = {
    id: crypto.randomUUID(),
    name: name.trim() || "New folder",
    createdAt: new Date().toISOString(),
  };
  mutate((current) => ({
    ...current,
    folders: [...current.folders, folder],
  }));
  return folder;
}

export function renameFolder(folderId: string, name: string): void {
  const nextName = name.trim();
  if (!nextName) return;
  mutate((current) => ({
    ...current,
    folders: current.folders.map((folder) =>
      folder.id === folderId ? { ...folder, name: nextName } : folder,
    ),
  }));
}

export function deleteFolder(folderId: string): void {
  mutate((current) => ({
    ...current,
    folders: current.folders.filter((folder) => folder.id !== folderId),
    collapsedFolderIds: current.collapsedFolderIds.filter((id) => id !== folderId),
    sessions: current.sessions.map((session) =>
      session.folderId === folderId ? { ...session, folderId: null } : session,
    ),
  }));
}

export function toggleFolderCollapsed(folderId: string): void {
  mutate((current) => {
    const open = !current.collapsedFolderIds.includes(folderId);
    return {
      ...current,
      collapsedFolderIds: open
        ? [...current.collapsedFolderIds, folderId]
        : current.collapsedFolderIds.filter((id) => id !== folderId),
    };
  });
}

export function syncLibraryFromDocuments(
  documents: Array<{
    id: string;
    fileName: string;
    size?: number;
    mimeType?: string;
    updatedAt?: string;
  }>,
): void {
  mutate((current) => {
    const knownFiles = new Map(current.files.map((file) => [file.documentId, file]));
    const files: LibraryFile[] = documents.map((document) => {
      const existing = knownFiles.get(document.id);
      return {
        documentId: document.id,
        title: document.fileName || existing?.title || "Untitled file",
        size: typeof document.size === "number" ? document.size : (existing?.size ?? 0),
        mimeType: document.mimeType || existing?.mimeType || "application/octet-stream",
        updatedAt: document.updatedAt || existing?.updatedAt || new Date().toISOString(),
      };
    });

    const alive = new Set(documents.map((document) => document.id));
    const titleById = new Map(documents.map((document) => [document.id, document.fileName]));
    const sessions = current.sessions
      .filter((session) => alive.has(session.documentId))
      .map((session) => ({
        ...session,
        title: titleById.get(session.documentId) || session.title,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return {
      ...current,
      files: files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      sessions,
    };
  });
}

/** @deprecated use syncLibraryFromDocuments */
export function syncSessionsFromDocuments(
  documents: Array<{ id: string; fileName: string; updatedAt?: string }>,
): void {
  syncLibraryFromDocuments(documents);
}
