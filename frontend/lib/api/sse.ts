import type { ChatStreamEvent, Citation, ProviderId } from "@/lib/api/types";

export type RawSseEvent = {
  event: string;
  data: string;
};

export function consumeSseBuffer(buffer: string): { events: RawSseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: RawSseEvent[] = [];

  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join("\n") });
    }
  }

  return { events, rest };
}

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function asCitation(value: unknown): Citation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.index !== "number" ||
    typeof record.documentId !== "string" ||
    typeof record.fileName !== "string" ||
    typeof record.page !== "number" ||
    typeof record.passageId !== "string" ||
    typeof record.snippet !== "string"
  ) {
    return null;
  }
  return {
    index: record.index,
    documentId: record.documentId,
    fileName: record.fileName,
    page: record.page,
    passageId: record.passageId,
    snippet: record.snippet,
  };
}

export function decodeChatEvent(raw: RawSseEvent): ChatStreamEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.data);
  } catch {
    return { type: "error", message: "The stream sent a message that was not JSON." };
  }

  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  switch (raw.event) {
    case "meta":
      if (typeof data.model !== "string") return null;
      return {
        type: "meta",
        messageId: typeof data.messageId === "string" ? data.messageId : "",
        model: data.model,
        provider: (typeof data.provider === "string" ? data.provider : "openai") as ProviderId,
      };
    case "token":
      return { type: "token", delta: typeof data.delta === "string" ? data.delta : "" };
    case "citation": {
      const citation = asCitation(data.citation ?? data);
      return citation ? { type: "citation", citation } : null;
    }
    case "not_found":
      return {
        type: "not_found",
        message: typeof data.message === "string" ? data.message : "Not found in this document.",
      };
    case "done":
      return {
        type: "done",
        messageId: typeof data.messageId === "string" ? data.messageId : "",
        finishReason:
          data.finishReason === "not_found" || data.finishReason === "aborted"
            ? data.finishReason
            : "stop",
        citations: Array.isArray(data.citations)
          ? data.citations.map(asCitation).filter((item): item is Citation => item !== null)
          : [],
      };
    case "error":
      return {
        type: "error",
        message: typeof data.message === "string" ? data.message : "The chat request failed.",
      };
    default:
      return null;
  }
}
