"use client";

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@/components/ui/button";
import type { Citation } from "@/lib/api/types";
import { markSnippet, scrollBehavior } from "@/lib/highlight";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export function PdfViewer({ fileUrl, highlight }: { fileUrl: string; highlight: Citation | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(720);
  const [error, setError] = useState("");

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setWidth(Math.max(280, node.clientWidth - 48));
    });
    observer.observe(node);
    const frame = window.requestAnimationFrame(() => {
      setWidth(Math.max(280, node.clientWidth - 48));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const node = pageRefs.current[highlight.page];
    node?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    const timer = window.setTimeout(() => {
      setPage(highlight.page);
      if (node) markSnippet(node, highlight.snippet);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [highlight, pages]);

  function go(next: number) {
    const target = Math.min(pages || 1, Math.max(1, next));
    setPage(target);
    pageRefs.current[target]?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-card/80 px-2 py-1.5 sm:px-3 sm:py-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            onClick={() => go(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-12 text-center text-xs tabular-nums">
            {pages ? `${page} / ${pages}` : "—"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            onClick={() => go(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))}
          >
            <ZoomOut />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(2, Number((value + 0.1).toFixed(2))))}
          >
            <ZoomIn />
          </Button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto px-3 py-4 sm:px-4 sm:py-6">
        {error ? (
          <p
            role="alert"
            className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          >
            {error}
          </p>
        ) : (
          <Document
            file={fileUrl}
            loading={<p className="text-center text-sm text-muted-foreground">Opening PDF…</p>}
            onLoadSuccess={({ numPages }) => {
              setPages(numPages);
              setError("");
            }}
            onLoadError={(loadError) => setError(loadError.message || "Could not open this PDF.")}
          >
            {Array.from({ length: pages }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <div
                  key={pageNumber}
                  ref={(node) => {
                    pageRefs.current[pageNumber] = node;
                  }}
                  className={highlight?.page === pageNumber ? "page-hit mb-4" : "mb-4"}
                >
                  <Page
                    pageNumber={pageNumber}
                    width={Math.round(width * zoom)}
                    renderAnnotationLayer
                    renderTextLayer
                    onRenderTextLayerSuccess={() => {
                      const node = pageRefs.current[pageNumber];
                      if (node && highlight?.page === pageNumber)
                        markSnippet(node, highlight.snippet);
                    }}
                    loading={<div className="h-[480px] animate-pulse rounded-lg bg-muted" />}
                  />
                </div>
              );
            })}
          </Document>
        )}
      </div>
    </div>
  );
}
