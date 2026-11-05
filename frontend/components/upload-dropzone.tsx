"use client";

import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { validateUpload } from "@/lib/files";
import { cn } from "@/lib/utils";

export const RESET_UPLOAD_EVENT = "chatdoc:reset-upload";

type UploadDropzoneProps = {
  disabled?: boolean;
  onUpload: (file: File, onProgress: (value: number) => void) => Promise<void>;
};

export function UploadDropzone({ disabled, onUpload }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setDragging(false);
    setProgress(null);
    setFileName("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  useEffect(() => {
    const onReset = () => reset();
    window.addEventListener(RESET_UPLOAD_EVENT, onReset);
    return () => window.removeEventListener(RESET_UPLOAD_EVENT, onReset);
  }, []);

  async function accept(file: File | undefined) {
    if (!file || disabled || progress !== null) return;
    const validation = validateUpload(file);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setError("");
    setFileName(file.name);
    setProgress(0);
    try {
      await onUpload(file, setProgress);
      // Always clear the progress UI so New chat / back-to-home never shows a stuck 100%.
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setProgress(null);
      setFileName("");
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          void accept(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[28px] border bg-card px-6 py-10 text-center shadow-[0_20px_60px_-36px_rgba(60,30,10,0.45)] transition",
          dragging ? "border-primary ring-4 ring-primary/15" : "border-border",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          aria-label="Browse files"
          accept=".pdf,.txt,.md,.markdown,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void accept(file);
          }}
        />
        {progress === null ? (
          <>
            <span className="mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileUp className="size-7" />
            </span>
            <p className="font-display text-2xl tracking-tight">Drop a file here</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              PDF, Word, Markdown, or plain text. Up to 20 MB.
            </p>
            <Button
              type="button"
              className="mt-6"
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Browse files
            </Button>
          </>
        ) : (
          <div className="w-full max-w-sm space-y-3">
            <p className="truncate text-sm font-medium">{fileName}</p>
            <Progress value={progress} aria-label="Upload progress" />
            <p className="text-sm text-muted-foreground">Uploading {progress}%</p>
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
