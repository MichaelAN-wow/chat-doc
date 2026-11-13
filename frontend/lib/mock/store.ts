import "server-only";

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DocumentPage, DocumentSummary, DocumentStatus } from "@/lib/api/types";
import { safeFileName } from "@/lib/files";
import { extractPages } from "@/lib/mock/extract";

export type StoredDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  error: string | null;
  pageCount: number | null;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, Promise<void>>();

const ID_RE = /^doc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mockDataDir(): string {
  return process.env.MOCK_DATA_DIR || path.join(process.cwd(), "data", "mock");
}

export class MockStoreError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assertId(id: string): void {
  if (!ID_RE.test(id)) {
    throw new MockStoreError(404, "not_found", "Document not found.");
  }
}

function docDir(id: string): string {
  assertId(id);
  return path.join(/*turbopackIgnore: true*/ mockDataDir(), id);
}

function progressFor(status: DocumentStatus): number {
  if (status === "pending") return 0.2;
  if (status === "processing") return 0.65;
  return 1;
}

export function toSummary(document: StoredDocument): DocumentSummary {
  return { ...document, progress: progressFor(document.status) };
}

async function readMeta(id: string): Promise<StoredDocument | null> {
  try {
    const raw = await readFile(path.join(docDir(id), "meta.json"), "utf8");
    return JSON.parse(raw) as StoredDocument;
  } catch {
    return null;
  }
}

async function writeMeta(document: StoredDocument): Promise<void> {
  await writeFile(path.join(docDir(document.id), "meta.json"), JSON.stringify(document, null, 2));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function schedule(id: string): void {
  if (jobs.has(id)) return;
  const job = (async () => {
    await delay(400);
    const pending = await readMeta(id);
    if (!pending || pending.status === "ready" || pending.status === "failed") return;
    pending.status = "processing";
    pending.updatedAt = new Date().toISOString();
    await writeMeta(pending);
    await delay(900);

    const current = await readMeta(id);
    if (!current || current.status === "ready" || current.status === "failed") return;

    try {
      if (/fail-processing/i.test(current.fileName)) {
        current.status = "failed";
        current.error = "The mock extractor rejected this file on purpose.";
        current.updatedAt = new Date().toISOString();
        await writeMeta(current);
        return;
      }

      const bytes = await readFile(path.join(docDir(id), "original"));
      const pages = await extractPages(current.fileName, current.mimeType, bytes);
      if (pages.length === 0) {
        current.status = "failed";
        current.error = "No readable text was found in this file.";
      } else {
        await writeFile(path.join(docDir(id), "text.json"), JSON.stringify({ pages }, null, 2));
        current.status = "ready";
        current.pageCount = pages.length;
        current.error = null;
      }
      current.updatedAt = new Date().toISOString();
      await writeMeta(current);
    } catch (error) {
      current.status = "failed";
      current.error = error instanceof Error ? error.message : "Processing failed.";
      current.updatedAt = new Date().toISOString();
      await writeMeta(current);
    }
  })().finally(() => {
    jobs.delete(id);
  });
  jobs.set(id, job);
}

export async function createDocument(input: {
  fileName: string;
  mimeType: string;
  data: Buffer;
}): Promise<DocumentSummary> {
  const id = `doc_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const document: StoredDocument = {
    id,
    fileName: safeFileName(input.fileName),
    mimeType: input.mimeType,
    size: input.data.byteLength,
    status: "pending",
    error: null,
    pageCount: null,
    createdAt: now,
    updatedAt: now,
  };
  await mkdir(docDir(id), { recursive: true });
  await writeFile(path.join(docDir(id), "original"), input.data);
  await writeMeta(document);
  schedule(id);
  return toSummary(document);
}

export async function getDocument(id: string): Promise<DocumentSummary | null> {
  const document = await readMeta(id);
  if (!document) return null;
  if ((document.status === "pending" || document.status === "processing") && !jobs.has(id)) {
    schedule(id);
  }
  return toSummary(document);
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  try {
    const entries = await readdir(/*turbopackIgnore: true*/ mockDataDir(), {
      withFileTypes: true,
    });
    const documents = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => getDocument(entry.name).catch(() => null)),
    );
    return documents
      .filter((document): document is DocumentSummary => document !== null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function deleteDocument(id: string): Promise<boolean> {
  const existing = await readMeta(id);
  if (!existing) return false;
  await rm(docDir(id), { recursive: true, force: true });
  return true;
}

export async function readOriginal(
  id: string,
): Promise<{ document: StoredDocument; data: Buffer } | null> {
  const document = await readMeta(id);
  if (!document) return null;
  const data = await readFile(path.join(docDir(id), "original"));
  return { document, data };
}

export async function readPages(
  id: string,
): Promise<{ document: StoredDocument; pages: DocumentPage[] } | null> {
  const document = await readMeta(id);
  if (!document) return null;
  if (document.status !== "ready") {
    throw new MockStoreError(409, "not_ready", "The document is not ready yet.");
  }
  const raw = await readFile(path.join(docDir(id), "text.json"), "utf8");
  const parsed = JSON.parse(raw) as { pages: DocumentPage[] };
  return { document, pages: parsed.pages };
}
