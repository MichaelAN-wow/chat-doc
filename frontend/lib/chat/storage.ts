import type { Citation } from "@/lib/api/types";

export type ChatMessageStatus = "streaming" | "complete" | "stopped" | "error" | "not_found";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  status: ChatMessageStatus;
  notFoundMessage?: string;
  error?: string;
  modelLabel?: string;
  createdAt: string;
};

export type Conversation = {
  documentId: string;
  modelConfigId: string;
  messages: ChatMessage[];
};

const keyFor = (documentId: string) => `chatdoc.chat.v1.${documentId}`;

const cache = new Map<string, Conversation>();
const listeners = new Map<string, Set<() => void>>();
const serverCache = new Map<string, Conversation>();

function blank(documentId: string): Conversation {
  return { documentId, modelConfigId: "", messages: [] };
}

function normalize(documentId: string, parsed: Conversation): Conversation {
  return {
    documentId,
    modelConfigId: typeof parsed.modelConfigId === "string" ? parsed.modelConfigId : "",
    messages: Array.isArray(parsed.messages)
      ? parsed.messages.map((message) =>
          message.status === "streaming" ? { ...message, status: "stopped" } : message,
        )
      : [],
  };
}

function readStored(documentId: string): Conversation {
  if (typeof window === "undefined") return getServerConversation(documentId);
  try {
    const raw = window.localStorage.getItem(keyFor(documentId));
    if (!raw) return blank(documentId);
    const parsed = JSON.parse(raw) as Conversation;
    if (!parsed || !Array.isArray(parsed.messages)) return blank(documentId);
    return normalize(documentId, parsed);
  } catch {
    return blank(documentId);
  }
}

export function getServerConversation(documentId: string): Conversation {
  const existing = serverCache.get(documentId);
  if (existing) return existing;
  const created = blank(documentId);
  serverCache.set(documentId, created);
  return created;
}

export function getConversationSnapshot(documentId: string): Conversation {
  const existing = cache.get(documentId);
  if (existing) return existing;
  const loaded = readStored(documentId);
  cache.set(documentId, loaded);
  return loaded;
}

export function subscribeConversation(documentId: string, listener: () => void): () => void {
  const group = listeners.get(documentId) ?? new Set<() => void>();
  group.add(listener);
  listeners.set(documentId, group);
  return () => group.delete(listener);
}

export function saveConversation(conversation: Conversation): void {
  cache.set(conversation.documentId, conversation);
  if (typeof window !== "undefined") {
    const persisted = normalize(conversation.documentId, conversation);
    window.localStorage.setItem(keyFor(conversation.documentId), JSON.stringify(persisted));
  }
  listeners.get(conversation.documentId)?.forEach((listener) => listener());
}
