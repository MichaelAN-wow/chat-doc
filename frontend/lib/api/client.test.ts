import { beforeEach, describe, expect, it } from "vitest";

import { apiRoot, createApiClient, toDocumentSummary } from "@/lib/api/client";
import { chatRequestSchema } from "@/lib/api/schema";
import type { ChatRequest, DocumentSummary } from "@/lib/api/types";

const request: ChatRequest = {
  documentId: "doc_1",
  message: "Summarize this",
  modelConfigId: "model_1",
  model: {
    provider: "openai",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    temperature: 0.2,
    maxTokens: 400,
    topK: 3,
  },
};

const document: DocumentSummary = {
  id: "doc_123",
  fileName: "notes.md",
  mimeType: "text/markdown",
  size: 20,
  status: "pending",
  error: null,
  pageCount: null,
  progress: 0.2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const backendDocument = {
  id: "doc_123",
  workspace_id: "ws_1",
  filename: "notes.md",
  file_type: "md",
  file_size: 20,
  status: "pending",
  error_message: null,
  chunk_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("api root", () => {
  it("uses the same-origin mock root unless a live base URL is configured", () => {
    expect(apiRoot({ useMock: true, apiBaseUrl: "" })).toBe("/api");
    expect(apiRoot({ useMock: false, apiBaseUrl: "https://docs.example.com/" })).toBe(
      "https://docs.example.com",
    );
  });
});

describe("chat request schema", () => {
  it("drops an API key if a caller puts one on the model object", () => {
    const parsed = chatRequestSchema.parse({
      ...request,
      model: { ...request.model, apiKey: "sk-live-secret" },
    });
    expect(parsed.model).not.toHaveProperty("apiKey");
  });
});

describe("document mapping", () => {
  it("maps backend document fields onto the viewer summary", () => {
    expect(toDocumentSummary({ ...backendDocument, status: "error", error_message: "bad" })).toMatchObject({
      fileName: "notes.md",
      mimeType: "text/markdown",
      status: "failed",
      error: "bad",
    });
  });
});

describe("api client", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function mockFetch(chatBody: string) {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/workspaces") && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify([{ id: "ws_1", name: "Library" }]), { status: 200 });
      }
      if (url.endsWith("/documents") && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify([backendDocument]), { status: 200 });
      }
      if (url.endsWith("/conversations") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "conv_1" }), { status: 201 });
      }
      return new Response(chatBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };
  }

  it("lists documents and translates backend chat events", async () => {
    const events: string[] = [];
    const client = createApiClient({
      fetchImpl: mockFetch(
        [
          'event: chunk\ndata: {"content":"Hello","type":"text"}\n\n',
          'event: citations\ndata: {"citations":[{"index":2,"chunk_id":"p1","document_id":"doc_1","filename":"notes.md","snippet":"Hello","page":2}]}\n\n',
          'event: done\ndata: {"message_id":"msg_1","refused":false}\n\n',
        ].join(""),
      ),
    });

    await expect(client.listDocuments()).resolves.toMatchObject([
      { id: "doc_123", fileName: "notes.md", status: "pending" },
    ]);
    const seen: { type: string; index?: number }[] = [];
    await client.streamChat(request, {
      onEvent: (event) => {
        events.push(event.type);
        if (event.type === "citation") seen.push({ type: event.type, index: event.citation.index });
      },
    });
    expect(events).toEqual(["token", "citation", "done"]);
    // Server index must be preserved (not renumbered to 1).
    expect(seen).toEqual([{ type: "citation", index: 2 }]);
  });

  it("reports upload progress and surfaces a server error", async () => {
    const progress: number[] = [];
    const client = createApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/workspaces")) {
          return new Response(JSON.stringify([{ id: "ws_1" }]), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      },
      xhrFactory: () => {
        const xhr = {
          upload: {} as {
            onprogress?: (event: {
              lengthComputable: boolean;
              loaded: number;
              total: number;
            }) => void;
            onload?: () => void;
          },
          status: 201,
          responseText: JSON.stringify({ document }),
          responseType: "",
          open() {},
          send() {
            xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
            xhr.upload.onload?.();
            xhr.onload();
          },
          onload() {},
          onerror() {},
          onabort() {},
        };
        return xhr as unknown as XMLHttpRequest;
      },
    });

    const file = new File(["hello"], "notes.md", { type: "text/markdown" });
    await expect(
      client.uploadDocument(file, (value) => progress.push(value)),
    ).resolves.toMatchObject({
      id: "doc_123",
    });
    expect(progress.at(-1)).toBe(100);
  });
});
