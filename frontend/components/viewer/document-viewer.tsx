"use client";

import dynamic from "next/dynamic";

import { StatusPill } from "@/components/status-pill";
import { TextViewer } from "@/components/viewer/text-viewer";
import type { Citation, DocumentSummary, DocumentText } from "@/lib/api/types";
import { extensionOf } from "@/lib/files";

const PdfViewer = dynamic(
  () => import("@/components/viewer/pdf-viewer").then((module) => module.PdfViewer),
  {
    ssr: false,
    loading: () => <p className="p-6 text-sm text-muted-foreground">Preparing the viewer…</p>,
  },
);

export function DocumentViewer({
  record,
  text,
  fileUrl,
  highlight,
  textError,
}: {
  record: DocumentSummary | null;
  text: DocumentText | null;
  fileUrl: string | null;
  highlight: Citation | null;
  textError: string | null;
}) {
  const extension = record ? extensionOf(record.fileName) : "";
  const isPdf = extension === ".pdf" || record?.mimeType === "application/pdf";
  const markdown = extension === ".md" || extension === ".markdown";

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-paper" aria-label="Document">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b bg-card/70 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{record?.fileName ?? "Document"}</h2>
          <p className="text-xs text-muted-foreground">
            {record?.pageCount ? `${record.pageCount} sections` : "Reading the file"}
          </p>
        </div>
        {record ? <StatusPill status={record.status} /> : null}
      </header>
      {highlight ? (
        <div
          role="status"
          aria-label={`Citation ${highlight.index} on page ${highlight.page}`}
          className="border-b bg-cite/25 px-4 py-2 text-xs"
        >
          <span className="font-medium">Citation {highlight.index}</span>
          <span className="text-muted-foreground"> · page {highlight.page} · </span>
          <span className="text-muted-foreground">{highlight.snippet}</span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        {record?.status === "failed" ? (
          <div
            role="alert"
            className="m-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          >
            <p className="font-medium">Processing failed</p>
            <p className="mt-1 text-muted-foreground">
              {record.error || "The file could not be read."}
            </p>
          </div>
        ) : textError ? (
          <p role="alert" className="m-6 text-sm text-destructive">
            {textError}
          </p>
        ) : isPdf && fileUrl ? (
          <PdfViewer fileUrl={fileUrl} highlight={highlight} />
        ) : text ? (
          <div className="h-full overflow-y-auto">
            <TextViewer text={text} markdown={markdown} highlight={highlight} />
          </div>
        ) : (
          <div className="space-y-3 p-6" aria-live="polite">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-72 animate-pulse rounded-2xl bg-muted" />
            <p className="text-sm text-muted-foreground">
              {record?.status === "processing" ? "Processing the file…" : "Waiting for the file…"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
