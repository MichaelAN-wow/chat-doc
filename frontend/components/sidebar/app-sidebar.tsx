"use client";

import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileText,
  Folder,
  FolderPlus,
  Library,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { ThemeToggle } from "@/components/theme-toggle";
import { RESET_UPLOAD_EVENT } from "@/components/upload-dropzone";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLibrary } from "@/hooks/use-library";
import { api } from "@/lib/api/client";
import { extensionOf, formatBytes } from "@/lib/files";
import type { LibraryFile, LibrarySession } from "@/lib/library/types";
import { cn } from "@/lib/utils";

const PREVIEW_LIMIT = 5;

function fileKind(file: Pick<LibraryFile, "title" | "mimeType">): {
  label: string;
  Icon: ComponentType<{ className?: string }>;
} {
  const ext = extensionOf(file.title);
  if (ext === ".pdf" || file.mimeType.includes("pdf")) {
    return { label: "PDF", Icon: File };
  }
  if (ext === ".docx" || file.mimeType.includes("word")) {
    return { label: "DOCX", Icon: FileText };
  }
  if (ext === ".md" || ext === ".markdown" || file.mimeType.includes("markdown")) {
    return { label: "MD", Icon: FileCode2 };
  }
  if (ext === ".txt" || file.mimeType.startsWith("text/")) {
    return { label: "TXT", Icon: FileText };
  }
  return { label: "FILE", Icon: File };
}

type AppSidebarProps = {
  activeDocumentId?: string;
  collapsed: boolean;
  width: number;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  resizing?: boolean;
};

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      <Icon className="size-3.5" />
      <span>{label}</span>
    </div>
  );
}

function ShowMoreList({ items, limit = PREVIEW_LIMIT }: { items: ReactNode[]; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length <= limit) {
    return <>{items}</>;
  }
  const visible = expanded ? items : items.slice(0, limit);
  const hidden = items.length - limit;
  return (
    <>
      {visible}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
      >
        {expanded ? "Show less" : `Show more… (${hidden})`}
      </button>
    </>
  );
}

function FolderMenuItems({
  folders,
  currentFolderId,
  onMove,
}: {
  folders: { id: string; name: string }[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
}) {
  return (
    <>
      <DropdownMenuLabel className="text-[11px] text-muted-foreground">
        Add to folder
      </DropdownMenuLabel>
      {folders.length === 0 ? (
        <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
      ) : (
        folders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            disabled={currentFolderId === folder.id}
            onClick={() => onMove(folder.id)}
          >
            <Folder className="size-3.5" />
            {folder.name}
          </DropdownMenuItem>
        ))
      )}
      {currentFolderId ? (
        <DropdownMenuItem onClick={() => onMove(null)}>Remove from folder</DropdownMenuItem>
      ) : null}
    </>
  );
}

function SessionRow({
  session,
  active,
  folders,
  indented,
  onOpen,
  onMove,
  onRemove,
}: {
  session: LibrarySession;
  active: boolean;
  folders: { id: string; name: string }[];
  indented?: boolean;
  onOpen: () => void;
  onMove: (folderId: string | null) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex w-full min-w-0 items-center gap-1 rounded-lg py-0.5 pr-0.5 pl-0.5",
        indented && "ml-3 w-[calc(100%-0.75rem)]",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/70",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-1.5 py-1.5 text-left text-sm"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <MessageSquare className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="size-7 shrink-0 border-sidebar-border bg-background/80 text-foreground"
            aria-label={`Actions for ${session.title}`}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <FolderMenuItems
            folders={folders}
            currentFolderId={session.folderId}
            onMove={onMove}
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2 />
            Remove session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppSidebar({
  activeDocumentId,
  collapsed,
  width,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
  onResizeStart,
  resizing,
}: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const library = useLibrary();
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .listDocuments()
      .then((documents) => {
        if (!cancelled) library.syncLibraryFromDocuments(documents);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname, library.syncLibraryFromDocuments]);

  function goHome() {
    onMobileOpenChange(false);
    window.dispatchEvent(new Event(RESET_UPLOAD_EVENT));
    router.push("/");
  }

  function openDocument(documentId: string, title: string) {
    library.upsertSession({ documentId, title, touch: false });
    onMobileOpenChange(false);
    router.push(`/documents/${documentId}`);
  }

  async function deleteLibraryFile(file: LibraryFile) {
    try {
      await api.deleteDocument(file.documentId);
    } catch {
      // File may already be gone from the mock store.
    }
    library.removeFile(file.documentId);
    toast.success("Removed from library");
    if (activeDocumentId === file.documentId) router.push("/");
  }

  function removeSessionOnly(documentId: string) {
    library.removeSession(documentId);
    if (activeDocumentId === documentId) router.push("/");
  }

  function submitFolder(event: FormEvent) {
    event.preventDefault();
    library.createFolder(folderName);
    setFolderName("");
    setCreatingFolder(false);
  }

  function candidatesForFolder(folderId: string) {
    const inFolder = new Set(
      (library.sessionsByFolder.get(folderId) ?? []).map((session) => session.documentId),
    );
    const fromSessions = library.unfiledSessions.filter(
      (session) => !inFolder.has(session.documentId),
    );
    const fromFiles = library.state.files.filter(
      (file) =>
        !inFolder.has(file.documentId) &&
        !fromSessions.some((session) => session.documentId === file.documentId),
    );
    return { fromSessions, fromFiles };
  }

  const chatRows = library.unfiledSessions.map((session) => (
    <SessionRow
      key={session.id}
      session={session}
      active={session.documentId === activeDocumentId}
      folders={library.state.folders}
      onOpen={() => openDocument(session.documentId, session.title)}
      onMove={(folderId) => library.moveSession(session.documentId, folderId)}
      onRemove={() => removeSessionOnly(session.documentId)}
    />
  ));

  const folderBlocks = library.state.folders.map((folder) => {
    const open = !library.state.collapsedFolderIds.includes(folder.id);
    const sessions = library.sessionsByFolder.get(folder.id) ?? [];
    const candidates = candidatesForFolder(folder.id);
    const canAdd = candidates.fromSessions.length > 0 || candidates.fromFiles.length > 0;
    const sessionRows = sessions.map((session) => (
      <SessionRow
        key={session.id}
        session={session}
        active={session.documentId === activeDocumentId}
        folders={library.state.folders}
        indented
        onOpen={() => openDocument(session.documentId, session.title)}
        onMove={(folderId) => library.moveSession(session.documentId, folderId)}
        onRemove={() => removeSessionOnly(session.documentId)}
      />
    ));

    return (
      <div key={folder.id} className="space-y-0.5">
        <div className="group flex w-full min-w-0 items-center gap-0.5 rounded-lg hover:bg-sidebar-accent/70">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-sm"
            onClick={() => library.toggleFolderCollapsed(folder.id)}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 opacity-60" />
            )}
            <Folder className="size-3.5 shrink-0 opacity-70" />
            <span className="truncate font-medium">{folder.name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{sessions.length}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="size-7 shrink-0 border-sidebar-border bg-background/80"
                aria-label={`Actions for ${folder.name}`}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {canAdd ? (
                <>
                  <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                    Add session
                  </DropdownMenuLabel>
                  {candidates.fromSessions.map((session) => (
                    <DropdownMenuItem
                      key={`session-${session.documentId}`}
                      onClick={() => library.addSessionToFolder(session.documentId, folder.id)}
                    >
                      <MessageSquare className="size-3.5" />
                      {session.title}
                    </DropdownMenuItem>
                  ))}
                  {candidates.fromFiles.map((file) => (
                    <DropdownMenuItem
                      key={`file-${file.documentId}`}
                      onClick={() =>
                        library.addSessionToFolder(file.documentId, folder.id, file.title)
                      }
                    >
                      <Library className="size-3.5" />
                      {file.title}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              ) : (
                <DropdownMenuItem disabled>No sessions to add</DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  const next = window.prompt("Rename folder", folder.name);
                  if (next) library.renameFolder(folder.id, next);
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => library.deleteFolder(folder.id)}
              >
                <Trash2 />
                Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {open ? (
          sessions.length === 0 ? (
            <p className="ml-7 px-2 py-1 text-xs text-muted-foreground">
              No sessions yet — use Add session
            </p>
          ) : (
            <ShowMoreList items={sessionRows} />
          )
        ) : null}
      </div>
    );
  });

  const libraryRows = library.state.files.map((file) => {
    const kind = fileKind(file);
    const KindIcon = kind.Icon;
    return (
      <div
        key={file.documentId}
        className={cn(
          "group flex w-full min-w-0 items-center gap-1 rounded-lg py-0.5 pr-0.5 pl-0.5",
          file.documentId === activeDocumentId
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/70",
        )}
      >
        <button
          type="button"
          onClick={() => openDocument(file.documentId, file.title)}
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-1.5 py-1.5 text-left text-sm"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <KindIcon className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate">{file.title}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {kind.label}
            {file.size > 0 ? ` · ${formatBytes(file.size)}` : ""}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="size-7 shrink-0 border-sidebar-border bg-background/80"
              aria-label={`Actions for ${file.title}`}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <FolderMenuItems
              folders={library.state.folders}
              currentFolderId={
                library.state.sessions.find((session) => session.documentId === file.documentId)
                  ?.folderId ?? null
              }
              onMove={(folderId) => {
                if (folderId) {
                  library.addSessionToFolder(file.documentId, folderId, file.title);
                } else {
                  library.moveSession(file.documentId, null);
                }
              }}
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openDocument(file.documentId, file.title)}>
              Open chat
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void deleteLibraryFile(file)}
            >
              <Trash2 />
              Delete file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  });

  const body = (
    <aside className="relative flex h-full w-full min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex min-w-0 items-center gap-1 border-b border-sidebar-border px-3 py-3">
        <div className="min-w-0 flex-1 overflow-hidden">
          <Wordmark />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="hidden shrink-0 lg:inline-flex"
          aria-label="Collapse sidebar"
          onClick={() => onCollapsedChange(true)}
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="w-full max-w-full min-w-0 space-y-5 py-3 pr-2 pl-2">
          <section aria-labelledby="chats-heading">
            <div id="chats-heading">
              <SectionLabel icon={MessageSquare} label="Chats" />
            </div>
            <div className="mt-1 space-y-0.5">
              {chatRows.length === 0 ? (
                <button
                  type="button"
                  onClick={goHome}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                >
                  + Start your first chat
                </button>
              ) : (
                <ShowMoreList items={chatRows} />
              )}
            </div>
          </section>

          <section aria-labelledby="folders-heading">
            <div className="flex items-center justify-between gap-2">
              <div id="folders-heading">
                <SectionLabel icon={Folder} label="Folders" />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label="New folder"
                onClick={() => setCreatingFolder(true)}
              >
                <FolderPlus className="size-3.5" />
              </Button>
            </div>

            {creatingFolder ? (
              <form onSubmit={submitFolder} className="mt-1 px-1">
                <input
                  autoFocus
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  onBlur={() => {
                    if (!folderName.trim()) setCreatingFolder(false);
                  }}
                  placeholder="Folder name"
                  className="h-8 w-full rounded-md border border-sidebar-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </form>
            ) : null}

            <div className="mt-1 space-y-1">
              {library.state.folders.length === 0 && !creatingFolder ? (
                <button
                  type="button"
                  onClick={() => setCreatingFolder(true)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                >
                  + New folder
                </button>
              ) : (
                <ShowMoreList items={folderBlocks} />
              )}
            </div>
          </section>

          <section aria-labelledby="library-heading">
            <div id="library-heading">
              <SectionLabel icon={Library} label="Library" />
            </div>
            <div className="mt-1 space-y-0.5">
              {libraryRows.length === 0 ? (
                <button
                  type="button"
                  onClick={goHome}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
                >
                  + Upload a file
                </button>
              ) : (
                <ShowMoreList items={libraryRows} />
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="space-y-3 border-t border-sidebar-border p-3">
        <div>
          <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Theme
          </p>
          <ThemeToggle variant="menu" />
        </div>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Uploaded files stay in Library. Drag the right edge to resize this sidebar.
        </p>
        <Button type="button" className="w-full" onClick={goHome}>
          <MessageSquarePlus className="size-4" />
          New chat
        </Button>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onResizeStart}
        className={cn(
          "absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none lg:block",
          "hover:bg-primary/20 active:bg-primary/35",
          resizing && "bg-primary/35",
        )}
      />
    </aside>
  );

  return (
    <>
      {collapsed ? (
        <div className="hidden h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar py-3 lg:flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Expand sidebar"
            onClick={() => onCollapsedChange(false)}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="mt-1"
                aria-label="New chat"
                onClick={goHome}
              >
                <MessageSquarePlus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <div className="relative hidden h-full min-w-0 shrink-0 lg:block" style={{ width }}>
          {body}
        </div>
      )}

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Close sidebar"
            onClick={() => onMobileOpenChange(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(100vw-3rem,20rem)] shadow-xl">{body}</div>
        </div>
      ) : null}
    </>
  );
}
