"use client";

import { ChevronDown, Settings2, Trash2, Upload } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ModelMenu } from "@/components/settings/model-menu";
import { ModelSettings } from "@/components/settings/model-settings";
import { StatusPill } from "@/components/status-pill";
import { DocumentViewer } from "@/components/viewer/document-viewer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChat } from "@/hooks/use-chat";
import { useDocumentContent, useDocumentRecord } from "@/hooks/use-document";
import { useLibrary } from "@/hooks/use-library";
import { useModels } from "@/hooks/use-models";
import { api } from "@/lib/api/client";
import type { Citation, DocumentSummary } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const SPLIT_KEY = "chatdoc.paneSplit.v1";
const MIN_PANE = 280;
const DEFAULT_SPLIT = 0.5;

function readStoredSplit(): number {
  if (typeof window === "undefined") return DEFAULT_SPLIT;
  try {
    const raw = window.localStorage.getItem(SPLIT_KEY);
    if (!raw) return DEFAULT_SPLIT;
    const value = Number(raw);
    if (!Number.isFinite(value)) return DEFAULT_SPLIT;
    return Math.min(0.8, Math.max(0.2, value));
  } catch {
    return DEFAULT_SPLIT;
  }
}

export function Workspace() {
  const params = useParams<{ id: string }>();
  const documentId = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const library = useLibrary();
  const { record, error, loading } = useDocumentRecord(documentId);
  const content = useDocumentContent(record);
  const models = useModels();
  const chat = useChat(documentId, models.state);
  const active = chat.model;
  const [pane, setPane] = useState<"chat" | "document">("chat");
  const [highlight, setHighlight] = useState<Citation | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [split, setSplit] = useState(DEFAULT_SPLIT);
  const [resizing, setResizing] = useState(false);
  const resizingRef = useRef(false);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSplit(readStoredSplit());
  }, []);

  useEffect(() => {
    if (!resizing) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizing]);

  function splitFromPointer(clientX: number) {
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return split;
    const min = rect.width < MIN_PANE * 2 ? rect.width * 0.3 : MIN_PANE;
    const max = rect.width - min;
    const next = Math.min(max, Math.max(min, clientX - rect.left));
    return next / rect.width;
  }

  function persistSplit(value: number) {
    setSplit(value);
    try {
      window.localStorage.setItem(SPLIT_KEY, String(value));
    } catch {
      // Ignore storage failures.
    }
  }

  function beginSplit(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizingRef.current = true;
    setResizing(true);
    setSplit(splitFromPointer(event.clientX));
  }

  function moveSplit(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizingRef.current) return;
    setSplit(splitFromPointer(event.clientX));
  }

  function endSplit(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizingRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizingRef.current = false;
    persistSplit(splitFromPointer(event.clientX));
    setResizing(false);
  }

  function nudgeSplit(delta: number) {
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    persistSplit(splitFromPointer(rect.left + rect.width * split + delta));
  }

  useEffect(() => {
    if (!record) return;
    document.title = `${record.fileName} · ChatDoc`;
    library.upsertFile({
      documentId: record.id,
      title: record.fileName,
      size: record.size,
      mimeType: record.mimeType,
      updatedAt: record.updatedAt,
    });
    library.upsertSession({ documentId: record.id, title: record.fileName, touch: false });
  }, [record, library.upsertFile, library.upsertSession]);

  useEffect(() => {
    let cancelled = false;
    api
      .listDocuments()
      .then((next) => {
        if (!cancelled) {
          setDocuments(next);
          library.syncLibraryFromDocuments(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [record?.status, documentId, library.syncLibraryFromDocuments]);

  function selectModel(id: string) {
    if (!models.state) return;
    models.update({ ...models.state, activeId: id });
    chat.setModelConfigId(id);
  }

  async function removeCurrent() {
    try {
      await api.deleteDocument(documentId);
      library.removeFile(documentId);
      toast.success("Document removed");
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the document.");
    }
  }

  function openCitation(citation: Citation) {
    setHighlight(citation);
    setPane("document");
  }

  const ready = record?.status === "ready";
  const failed = record?.status === "failed";
  const statusLabel = !record
    ? loading
      ? "Loading document…"
      : error || "Document unavailable"
    : record.status === "ready"
      ? active
        ? `Ready · ${active.model}`
        : "Ready"
      : record.status === "failed"
        ? record.error || "Processing failed"
        : record.status === "processing"
          ? "Processing…"
          : "Pending…";

  return (
    <AppShell activeDocumentId={documentId}>
      <div className="@container/workspace flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <header className="flex min-w-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="min-w-0 max-w-full flex-1 sm:max-w-xs sm:flex-none">
              <span className="truncate">{record?.fileName ?? "Document"}</span>
              <ChevronDown className="shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
            {documents.length === 0 ? (
              <DropdownMenuItem disabled>No files yet</DropdownMenuItem>
            ) : (
              documents.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => router.push(`/documents/${item.id}`)}
                >
                  <span className="truncate">{item.fileName}</span>
                  {item.id === documentId ? (
                    <span className="ml-auto text-xs text-muted-foreground">Open</span>
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/")}>
              <Upload />
              Upload another
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => void removeCurrent()}>
              <Trash2 />
              Remove this file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {record ? (
            <span className="hidden sm:inline-flex">
              <StatusPill status={record.status} />
            </span>
          ) : null}
          <div className="flex rounded-lg border p-0.5 @min-[720px]/workspace:hidden">
            <Button
              type="button"
              size="sm"
              variant={pane === "document" ? "secondary" : "ghost"}
              onClick={() => setPane("document")}
            >
              Document
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pane === "chat" ? "secondary" : "ghost"}
              onClick={() => setPane("chat")}
            >
              Chat
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Model settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
          </Button>
        </div>
      </header>

      {error && !record ? (
        <main id="main" className="mx-auto max-w-lg px-6 py-16 text-center">
          <h1 className="font-display text-3xl">This document is gone</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button type="button" className="mt-6" onClick={() => router.push("/")}>
            Back to upload
          </Button>
        </main>
      ) : (
        <div
          id="main"
          ref={splitRef}
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col @min-[720px]/workspace:flex-row",
            resizing && "select-none",
          )}
          style={{ "--doc-split": `${split * 100}%` } as CSSProperties}
        >
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 @min-[720px]/workspace:w-(--doc-split) @min-[720px]/workspace:max-w-[calc(100%-16rem)] @min-[720px]/workspace:min-w-64 @min-[720px]/workspace:flex-none",
              pane !== "document" && "@max-[719px]/workspace:hidden",
            )}
          >
            <DocumentViewer
              record={record}
              text={content.text}
              fileUrl={content.fileUrl}
              highlight={highlight}
              textError={content.error}
            />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize document and chat"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={Math.round(split * 100)}
            tabIndex={0}
            onPointerDown={beginSplit}
            onPointerMove={moveSplit}
            onPointerUp={endSplit}
            onPointerCancel={endSplit}
            onDoubleClick={() => persistSplit(DEFAULT_SPLIT)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") nudgeSplit(-24);
              if (event.key === "ArrowRight") nudgeSplit(24);
              if (event.key === "Home") persistSplit(0.3);
              if (event.key === "End") persistSplit(0.7);
            }}
            className={cn(
              "group relative z-10 hidden w-2 shrink-0 cursor-col-resize touch-none @min-[720px]/workspace:block",
              "focus-visible:outline-none",
            )}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border",
                "group-hover:w-0.5 group-hover:bg-primary/60",
                "group-focus-visible:w-0.5 group-focus-visible:bg-primary",
                resizing && "w-0.5 bg-primary",
              )}
            />
          </div>
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 @min-[720px]/workspace:min-w-64",
              pane !== "chat" && "@max-[719px]/workspace:hidden",
            )}
          >
            <ChatPanel
              messages={chat.messages}
              streaming={chat.streaming}
              ready={Boolean(ready && active)}
              failed={Boolean(failed)}
              statusLabel={statusLabel}
              suggestions={content.questions}
              model={active}
              onSend={(text) => void chat.send(text)}
              onStop={chat.stop}
              onRegenerate={chat.regenerate}
              onCitation={openCitation}
              modelControl={
                <ModelMenu
                  configs={models.state?.configs ?? []}
                  active={active}
                  onSelect={selectModel}
                  onManage={() => setSettingsOpen(true)}
                />
              }
            />
          </div>
        </div>
      )}

      {models.state ? (
        <ModelSettings
          key={settingsOpen ? "models-open" : "models-closed"}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          state={models.state}
          onChange={models.update}
          onUse={(id) => {
            selectModel(id);
            setSettingsOpen(false);
          }}
        />
      ) : null}
      </div>
    </AppShell>
  );
}
