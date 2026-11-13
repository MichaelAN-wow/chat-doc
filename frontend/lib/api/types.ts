export const PROVIDER_IDS = [
  "nvidia",
  "openai",
  "anthropic",
  "google",
  "azure-openai",
  "ollama",
  "openai-compatible",
  "groq",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export type DocumentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  error: string | null;
  pageCount: number | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
};

export type Passage = {
  id: string;
  text: string;
};

export type DocumentPage = {
  page: number;
  passages: Passage[];
};

export type DocumentText = {
  documentId: string;
  fileName: string;
  mimeType: string;
  pages: DocumentPage[];
};

export type Citation = {
  index: number;
  documentId: string;
  fileName: string;
  page: number;
  passageId: string;
  snippet: string;
};

export type ModelRequest = {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  topK: number;
};

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  documentId: string;
  message: string;
  modelConfigId: string;
  history?: ChatHistoryTurn[];
  model: ModelRequest;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export type RuntimeConfig = {
  useMock: boolean;
  apiBaseUrl: string;
};

export type ChatStreamEvent =
  | { type: "meta"; messageId: string; model: string; provider: ProviderId }
  | { type: "citation"; citation: Citation }
  | { type: "token"; delta: string }
  | { type: "not_found"; message: string }
  | {
      type: "done";
      messageId: string;
      finishReason: "stop" | "not_found" | "aborted";
      citations: Citation[];
    }
  | { type: "error"; message: string };

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  suggestedModels: string[];
  notes: string;
};

export type SuggestionsResponse = {
  questions: string[];
};

export type HealthResponse = {
  ok: boolean;
  mode: "mock" | "live";
  version: string;
};
