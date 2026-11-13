import type {
  ApiErrorBody,
  ChatRequest,
  ChatStreamEvent,
  DocumentSummary,
  DocumentText,
  HealthResponse,
  ProviderInfo,
  RuntimeConfig,
  SuggestionsResponse,
} from "@/lib/api/types";
import { PROVIDERS } from "@/lib/models/catalog";
import { consumeSseBuffer, decodeChatEvent, type RawSseEvent } from "@/lib/api/sse";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type ApiClientOptions = {
  resolveConfig?: () => Promise<RuntimeConfig>;
  fetchImpl?: typeof fetch;
  xhrFactory?: () => XMLHttpRequest;
};

type UploadResult = {
  status: number;
  body: string;
};

type BackendDocument = {
  id: string;
  workspace_id?: string;
  filename?: string;
  fileName?: string;
  file_type?: string;
  mimeType?: string;
  file_size?: number;
  size?: number;
  status: DocumentSummary["status"] | "error";
  error_message?: string | null;
  error?: string | null;
  chunk_count?: number;
  pageCount?: number | null;
  progress?: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

const API = "/api/v1";
const WORKSPACE_KEY = "chatdoc.workspaceId";
const CONVERSATION_KEY = "chatdoc.backendConversation.v1";

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function parseError(status: number, body: string): ApiError {
  try {
    const json = JSON.parse(body) as ApiErrorBody & { detail?: unknown };
    if (json?.error?.message) {
      return new ApiError(json.error.message, status, json.error.code || "http_error");
    }
    if (typeof json?.detail === "string" && json.detail) {
      return new ApiError(json.detail, status, "http_error");
    }
  } catch {
    // The body was not the error envelope.
  }
  return new ApiError(`Request failed (${status || "network"}).`, status, "http_error");
}

function mimeFor(fileType: string | undefined, fileName: string): string {
  if (fileType === "pdf" || fileName.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (fileType === "docx" || fileName.toLowerCase().endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (
    fileType === "md" ||
    fileType === "markdown" ||
    fileName.toLowerCase().endsWith(".md") ||
    fileName.toLowerCase().endsWith(".markdown")
  ) {
    return "text/markdown";
  }
  return "text/plain";
}

export function toDocumentSummary(input: BackendDocument): DocumentSummary {
  if (input.fileName && input.mimeType && input.createdAt && input.updatedAt) {
    return {
      id: input.id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size ?? 0,
      status: input.status === "error" ? "failed" : input.status,
      error: input.error ?? null,
      pageCount: input.pageCount ?? null,
      progress: input.progress ?? (input.status === "ready" ? 1 : 0.2),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  const fileName = input.filename || input.fileName || "document";
  const status = input.status === "error" ? "failed" : input.status;
  const progress =
    status === "ready" || status === "failed" ? 1 : status === "processing" ? 0.6 : 0.2;
  return {
    id: input.id,
    fileName,
    mimeType: mimeFor(input.file_type, fileName),
    size: input.file_size ?? input.size ?? 0,
    status,
    error: input.error_message ?? input.error ?? null,
    pageCount: input.chunk_count ? input.chunk_count : null,
    progress,
    createdAt: input.created_at || input.createdAt || new Date(0).toISOString(),
    updatedAt: input.updated_at || input.updatedAt || new Date(0).toISOString(),
  };
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (value: number) => void,
  xhrFactory?: () => XMLHttpRequest,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = xhrFactory ? xhrFactory() : new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.upload.onload = () => onProgress(100);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText || "" });
    xhr.onerror = () =>
      reject(new ApiError("Upload failed. Check your connection and try again.", 0, "network"));
    xhr.onabort = () => reject(new ApiError("Upload cancelled.", 0, "aborted"));
    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

export function apiRoot(config: RuntimeConfig): string {
  if (config.useMock || !config.apiBaseUrl) return "/api";
  return config.apiBaseUrl.replace(/\/$/, "");
}

function readConversationMap(): Record<string, string> {
  const storage = browserStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(CONVERSATION_KEY) || "{}") as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeConversation(documentId: string, conversationId: string) {
  const storage = browserStorage();
  if (!storage) return;
  const map = readConversationMap();
  map[documentId] = conversationId;
  storage.setItem(CONVERSATION_KEY, JSON.stringify(map));
}

function translateStreamEvent(raw: RawSseEvent, answer: { text: string }): ChatStreamEvent[] {
  if (["meta", "token", "citation", "not_found", "done", "error"].includes(raw.event)) {
    const event = decodeChatEvent(raw);
    if (!event) return [];
    if (event.type === "token") answer.text += event.delta;
    return [event];
  }

  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw.data) as unknown;
    data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return [{ type: "error", message: "The stream sent a message that was not JSON." }];
  }

  if (raw.event === "chunk") {
    const delta = typeof data.content === "string" ? data.content : "";
    answer.text += delta;
    return [{ type: "token", delta }];
  }

  if (raw.event === "citations") {
    const list = Array.isArray(data.citations) ? data.citations : [];
    const events: ChatStreamEvent[] = [];
    list.forEach((item, position) => {
      if (!item || typeof item !== "object") return;
      const citation = item as Record<string, unknown>;
      const page = Number(citation.page ?? 1);
      const rawIndex = Number(citation.index);
      // Prefer server index (matches [n] in the answer). Fall back only for old payloads.
      const index =
        Number.isFinite(rawIndex) && rawIndex > 0 ? rawIndex : position + 1;
      events.push({
        type: "citation",
        citation: {
          index,
          documentId: String(citation.document_id ?? citation.documentId ?? ""),
          fileName: String(citation.filename ?? citation.fileName ?? "document"),
          page: Number.isFinite(page) && page > 0 ? page : 1,
          passageId: String(citation.chunk_id ?? citation.passageId ?? ""),
          snippet: String(citation.snippet ?? ""),
        },
      });
    });
    // Citations come from the server for passages the model used. Do not invent markers.
    return events;
  }

  if (raw.event === "done") {
    const messageId = String(data.message_id ?? data.messageId ?? "");
    if (data.refused) {
      return [
        {
          type: "not_found",
          message: "Not found in this document.",
        },
        { type: "done", messageId, finishReason: "not_found", citations: [] },
      ];
    }
    return [{ type: "done", messageId, finishReason: "stop", citations: [] }];
  }

  return [];
}

export function createApiClient(options: ApiClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  let workspaceTask: Promise<string> | null = null;

  async function read(response: Response): Promise<unknown> {
    const body = await response.text();
    if (!response.ok) throw parseError(response.status, body);
    if (!body) return null;
    return JSON.parse(body) as unknown;
  }

  async function ensureWorkspace(): Promise<string> {
    if (!workspaceTask) {
      workspaceTask = resolveWorkspace().catch((error) => {
        workspaceTask = null;
        throw error;
      });
    }
    return workspaceTask;
  }

  async function resolveWorkspace(): Promise<string> {
    const storage = browserStorage();
    const cached = storage?.getItem(WORKSPACE_KEY);
    if (cached) {
      const existing = await fetchImpl(`${API}/workspaces/${cached}`);
      if (existing.ok) return cached;
    }

    const listed = await fetchImpl(`${API}/workspaces`);
    const workspaces = (await read(listed)) as { id: string }[] | { documents?: unknown };
    if (Array.isArray(workspaces) && workspaces[0]?.id) {
      storage?.setItem(WORKSPACE_KEY, workspaces[0].id);
      return workspaces[0].id;
    }

    const created = await fetchImpl(`${API}/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Library", description: "Uploaded documents" }),
    });
    const workspace = (await read(created)) as { id: string };
    storage?.setItem(WORKSPACE_KEY, workspace.id);
    return workspace.id;
  }

  async function ensureConversation(workspaceId: string, documentId: string): Promise<string> {
    const existing = readConversationMap()[documentId];
    if (existing) return existing;

    const response = await fetchImpl(`${API}/workspaces/${workspaceId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Document chat" }),
    });
    const conversation = (await read(response)) as { id: string };
    writeConversation(documentId, conversation.id);
    return conversation.id;
  }

  return {
    async uploadDocument(
      file: File,
      onProgress: (value: number) => void,
    ): Promise<DocumentSummary> {
      const workspaceId = await ensureWorkspace();
      const result = await uploadWithProgress(
        `${API}/workspaces/${workspaceId}/documents`,
        file,
        onProgress,
        options.xhrFactory,
      );
      if (result.status < 200 || result.status >= 300) {
        throw parseError(result.status, result.body);
      }
      const json = JSON.parse(result.body) as BackendDocument & { document?: BackendDocument };
      return toDocumentSummary(json.document ?? json);
    },

    async listDocuments(): Promise<DocumentSummary[]> {
      const workspaceId = await ensureWorkspace();
      const response = await fetchImpl(`${API}/workspaces/${workspaceId}/documents`);
      const json = (await read(response)) as BackendDocument[] | { documents: BackendDocument[] };
      const documents = Array.isArray(json) ? json : json.documents;
      return documents.map((document) => toDocumentSummary(document));
    },

    async getDocument(id: string): Promise<DocumentSummary> {
      const response = await fetchImpl(`${API}/documents/${id}`);
      return toDocumentSummary((await read(response)) as BackendDocument);
    },

    async getStatus(id: string): Promise<DocumentSummary> {
      const response = await fetchImpl(`${API}/documents/${id}`);
      return toDocumentSummary((await read(response)) as BackendDocument);
    },

    async deleteDocument(id: string): Promise<void> {
      const response = await fetchImpl(`${API}/documents/${id}`, { method: "DELETE" });
      if (response.status !== 204) {
        const body = await response.text();
        if (!response.ok) throw parseError(response.status, body);
      }
      const storage = browserStorage();
      if (!storage) return;
      const map = readConversationMap();
      delete map[id];
      storage.setItem(CONVERSATION_KEY, JSON.stringify(map));
    },

    async documentFileUrl(id: string): Promise<string> {
      return `${API}/documents/${id}/file`;
    },

    async getDocumentText(id: string): Promise<DocumentText> {
      const response = await fetchImpl(`${API}/documents/${id}/text`);
      return (await read(response)) as DocumentText;
    },

    async getSuggestions(id: string): Promise<string[]> {
      const response = await fetchImpl(`${API}/documents/${id}/suggestions`);
      const json = (await read(response)) as SuggestionsResponse;
      return json.questions;
    },

    async health(): Promise<HealthResponse> {
      const response = await fetchImpl(`${API}/health`);
      const json = (await read(response)) as { status?: string; ok?: boolean };
      return {
        ok: json.ok ?? json.status === "ok",
        mode: "live",
        version: "1",
      };
    },

    async listProviders(): Promise<ProviderInfo[]> {
      return PROVIDERS;
    },

    async streamChat(
      body: ChatRequest,
      handlers: { signal?: AbortSignal; onEvent: (event: ChatStreamEvent) => void },
    ): Promise<void> {
      const workspaceId = await ensureWorkspace();
      const conversationId = await ensureConversation(workspaceId, body.documentId);
      const response = await fetchImpl(`${API}/conversations/${conversationId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          message: body.message,
          document_id: body.documentId,
          top_k: body.model.topK,
          model: {
            provider: body.model.provider,
            model: body.model.model,
            base_url: body.model.baseUrl,
            temperature: body.model.temperature,
            max_tokens: body.model.maxTokens,
            top_k: body.model.topK,
          },
        }),
        signal: handlers.signal,
      });

      if (!response.ok) {
        throw parseError(response.status, await response.text());
      }
      if (!response.body) {
        throw new ApiError("The chat response was empty.", 500, "empty_stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const answer = { text: "" };

      const emitBuffer = (chunk: string) => {
        const parsed = consumeSseBuffer(chunk);
        buffer = parsed.rest;
        for (const raw of parsed.events) {
          for (const event of translateStreamEvent(raw, answer)) {
            handlers.onEvent(event);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        emitBuffer(buffer);
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        emitBuffer(`${buffer}\n\n`);
      }
    },
  };
}

export const api = createApiClient();

export type ApiClient = ReturnType<typeof createApiClient>;
