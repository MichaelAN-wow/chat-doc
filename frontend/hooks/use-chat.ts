"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { api } from "@/lib/api/client";
import type { ChatMessage } from "@/lib/chat/storage";
import {
  getConversationSnapshot,
  getServerConversation,
  saveConversation,
  subscribeConversation,
} from "@/lib/chat/storage";
import type { ModelState } from "@/lib/models/catalog";
import { toModelRequest } from "@/lib/models/catalog";
import { resolveConfig } from "@/lib/models/storage";

export function useChat(documentId: string, modelState: ModelState | null) {
  const conversation = useSyncExternalStore(
    (listener) => subscribeConversation(documentId, listener),
    () => getConversationSnapshot(documentId),
    () => getServerConversation(documentId),
  );
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const model = modelState
    ? resolveConfig(modelState, conversation.modelConfigId || modelState.activeId)
    : null;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      busyRef.current = false;
    };
  }, [documentId]);

  const setModelConfigId = useCallback(
    (id: string) => {
      const current = getConversationSnapshot(documentId);
      saveConversation({ ...current, modelConfigId: id });
    },
    [documentId],
  );

  const patch = useCallback(
    (id: string, partial: Partial<ChatMessage>) => {
      const current = getConversationSnapshot(documentId);
      saveConversation({
        ...current,
        messages: current.messages.map((message) =>
          message.id === id ? { ...message, ...partial } : message,
        ),
      });
    },
    [documentId],
  );

  const send = useCallback(
    async (text: string, reuse = false) => {
      if (!model || busyRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const existing = getConversationSnapshot(documentId).messages;
      const base =
        reuse && existing.at(-1)?.role === "assistant" ? existing.slice(0, -1) : existing;
      const userMessage: ChatMessage | undefined = reuse
        ? base.at(-1)
        : {
            id: crypto.randomUUID(),
            role: "user",
            content: trimmed,
            citations: [],
            status: "complete",
            createdAt: new Date().toISOString(),
          };

      if (!userMessage || userMessage.role !== "user") return;

      const prior = (reuse ? base.slice(0, -1) : existing)
        .filter((message) => message.content && message.status !== "error")
        .map((message) => ({ role: message.role, content: message.content }));

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      busyRef.current = true;

      const assistantId = crypto.randomUUID();
      const assistant: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        citations: [],
        status: "streaming",
        modelLabel: model.name,
        createdAt: new Date().toISOString(),
      };

      saveConversation({
        documentId,
        modelConfigId: getConversationSnapshot(documentId).modelConfigId || model.id,
        messages: reuse ? [...base, assistant] : [...base, userMessage, assistant],
      });
      setStreaming(true);

      let content = "";
      const citations: ChatMessage["citations"] = [];
      let notFound = false;
      let failed = false;

      try {
        await api.streamChat(
          {
            documentId,
            message: userMessage.content,
            modelConfigId: model.id,
            history: prior,
            model: toModelRequest(model),
          },
          {
            signal: controller.signal,
            onEvent(event) {
              if (event.type === "token") {
                content += event.delta;
                patch(assistantId, { content });
              } else if (event.type === "citation") {
                citations.push(event.citation);
                patch(assistantId, { citations: [...citations] });
              } else if (event.type === "not_found") {
                notFound = true;
                patch(assistantId, {
                  status: "not_found",
                  notFoundMessage: event.message,
                  content: "",
                });
              } else if (event.type === "error") {
                failed = true;
                patch(assistantId, { status: "error", error: event.message, content });
              }
            },
          },
        );

        if (controller.signal.aborted) {
          patch(assistantId, { status: "stopped", content, citations: [...citations] });
        } else if (!notFound && !failed) {
          patch(assistantId, { status: "complete", content, citations: [...citations] });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          patch(assistantId, { status: "stopped", content });
        } else {
          patch(assistantId, {
            status: "error",
            error: error instanceof Error ? error.message : "The request failed.",
            content,
          });
        }
      } finally {
        busyRef.current = false;
        setStreaming(false);
      }
    },
    [documentId, model, patch],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(() => {
    const lastUser = [...getConversationSnapshot(documentId).messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!lastUser) return;
    void send(lastUser.content, true);
  }, [documentId, send]);

  return {
    messages: conversation.messages,
    streaming,
    model,
    modelConfigId: conversation.modelConfigId,
    setModelConfigId,
    send,
    stop,
    regenerate,
  };
}
