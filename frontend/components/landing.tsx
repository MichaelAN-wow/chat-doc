"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { RESET_UPLOAD_EVENT, UploadDropzone } from "@/components/upload-dropzone";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/hooks/use-library";
import { api } from "@/lib/api/client";

export function Landing() {
  const router = useRouter();
  const library = useLibrary();
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dropzoneKey, setDropzoneKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .listDocuments()
      .then((next) => {
        if (!cancelled) library.syncLibraryFromDocuments(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setListError(error instanceof Error ? error.message : "Could not load the library.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [library.syncLibraryFromDocuments]);

  useEffect(() => {
    const onReset = () => {
      setBusy(false);
      setDropzoneKey((value) => value + 1);
    };
    window.addEventListener(RESET_UPLOAD_EVENT, onReset);
    return () => window.removeEventListener(RESET_UPLOAD_EVENT, onReset);
  }, []);

  async function upload(file: File, onProgress: (value: number) => void) {
    setBusy(true);
    try {
      const document = await api.uploadDocument(file, onProgress);
      library.upsertFile({
        documentId: document.id,
        title: document.fileName,
        size: document.size,
        mimeType: document.mimeType,
        updatedAt: document.updatedAt,
      });
      library.upsertSession({ documentId: document.id, title: document.fileName });
      router.push(`/documents/${document.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function trySample() {
    setBusy(true);
    try {
      const response = await fetch("/samples/harbor-brief.md");
      if (!response.ok) throw new Error("The sample brief is missing.");
      const blob = await response.blob();
      const file = new File([blob], "harbor-brief.md", { type: "text/markdown" });
      const document = await api.uploadDocument(file, () => undefined);
      library.upsertFile({
        documentId: document.id,
        title: document.fileName,
        size: document.size,
        mimeType: document.mimeType,
        updatedAt: document.updatedAt,
      });
      library.upsertSession({ documentId: document.id, title: document.fileName });
      router.push(`/documents/${document.id}`);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Could not open the sample.");
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top,var(--paper),var(--background)_55%)]">
        <main id="main" className="mx-auto flex w-full max-w-xl flex-col px-4 pt-8 pb-12 sm:px-6 sm:pt-12 sm:pb-16">
          <p className="text-center text-xs font-medium tracking-[0.18em] text-primary uppercase">
            Document Q&A
          </p>
          <h1 className="mt-3 text-center font-display text-3xl leading-[1.08] tracking-tight text-balance sm:text-4xl lg:text-5xl">
            Chat with the page, not the whole file.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-center text-base text-muted-foreground text-pretty">
            Drop a PDF, Word, Markdown, or text file. Uploads are kept in the sidebar Library, and
            answers come back with citations you can click.
          </p>
          <div className="mt-8">
            <UploadDropzone key={dropzoneKey} disabled={busy} onUpload={upload} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border px-2 py-1">PDF</span>
            <span className="rounded-full border px-2 py-1">DOCX</span>
            <span className="rounded-full border px-2 py-1">Markdown</span>
            <span className="rounded-full border px-2 py-1">TXT</span>
            <span>20 MB max</span>
          </div>
          <div className="mt-6 text-center">
            <Button type="button" variant="outline" onClick={() => void trySample()} disabled={busy}>
              Try the sample brief
            </Button>
          </div>
          {listError ? (
            <p role="alert" className="mt-6 text-center text-sm text-destructive">
              {listError}
            </p>
          ) : null}
          <p className="mt-10 text-center text-xs text-muted-foreground">
            No account. Files stay in this browser Library until you delete them.
          </p>
        </main>
      </div>
    </AppShell>
  );
}
