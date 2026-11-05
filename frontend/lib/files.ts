export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const EXTENSIONS = [".pdf", ".txt", ".md", ".markdown", ".docx"] as const;

export type AllowedExtension = (typeof EXTENSIONS)[number];

const MIME_BY_EXTENSION: Record<AllowedExtension, string[]> = {
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/x-markdown", "text/plain"],
  ".markdown": ["text/markdown", "text/x-markdown", "text/plain"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

export type FileLike = {
  name: string;
  size: number;
  type: string;
};

export type FileValidation =
  { ok: true; extension: AllowedExtension; mimeType: string } | { ok: false; message: string };

export function extensionOf(fileName: string): string {
  const base = fileName.trim().toLowerCase().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

export function validateUpload(file: FileLike): FileValidation {
  if (!file.name.trim()) {
    return { ok: false, message: "Choose a file with a name." };
  }

  const extension = extensionOf(file.name);
  if (!EXTENSIONS.includes(extension as AllowedExtension)) {
    return {
      ok: false,
      message: "Use a PDF, TXT, Markdown, or DOCX file.",
    };
  }

  const allowed = extension as AllowedExtension;
  const mime = file.type.trim().toLowerCase();
  if (mime && !MIME_BY_EXTENSION[allowed].includes(mime) && mime !== "application/octet-stream") {
    return {
      ok: false,
      message: `That file type (${file.type}) does not match ${allowed}.`,
    };
  }

  if (file.size <= 0) {
    return { ok: false, message: "That file is empty." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Files need to be 20 MB or smaller." };
  }

  return {
    ok: true,
    extension: allowed,
    mimeType: mime && mime !== "application/octet-stream" ? mime : MIME_BY_EXTENSION[allowed][0],
  };
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function safeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() || "document";
  return base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
}
