"use client";

import { Copy, Mic, MicOff, RefreshCw, Send, Square } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { MessageBody } from "@/components/chat/message-body";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import type { Citation } from "@/lib/api/types";
import type { ChatMessage } from "@/lib/chat/storage";
import type { ModelConfig } from "@/lib/models/catalog";
import { cn } from "@/lib/utils";

type ChatPanelProps = {
  messages: ChatMessage[];
  streaming: boolean;
  ready: boolean;
  failed: boolean;
  statusLabel: string;
  suggestions: string[];
  model: ModelConfig | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onRegenerate: () => void;
  onCitation: (citation: Citation) => void;
  modelControl: ReactNode;
};

export function ChatPanel({
  messages,
  streaming,
  ready,
  failed,
  statusLabel,
  suggestions,
  model,
  onSend,
  onStop,
  onRegenerate,
  onCitation,
  modelControl,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const speech = useSpeechToText({
    onFinal: (chunk) => {
      const next = `${draftRef.current}${draftRef.current && !draftRef.current.endsWith(" ") ? " " : ""}${chunk.trim()}`;
      setDraft(next.trimStart());
      setInterim("");
    },
    onInterim: (chunk) => setInterim(chunk.trim()),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!ready || streaming || failed) speech.stop();
  }, [ready, streaming, failed, speech.stop]);

  useEffect(() => {
    if (speech.status === "error" && speech.error) {
      toast.error(
        speech.error === "not-allowed"
          ? "Microphone permission was denied."
          : "Could not start voice input.",
      );
    }
  }, [speech.status, speech.error]);

  function submit() {
    const text = draft.trim();
    if (!text || !ready || streaming) return;
    speech.stop();
    setInterim("");
    setDraft("");
    onSend(text);
  }

  const composerValue = interim
    ? `${draft}${draft && !draft.endsWith(" ") ? " " : ""}${interim}`
    : draft;
  const canUseMic = ready && !streaming;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background" aria-label="Chat">
      <header className="flex min-w-0 items-center gap-2 border-b px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Chat</h2>
          <p className="truncate text-xs text-muted-foreground">{statusLabel}</p>
        </div>
        <div className="shrink-0">{modelControl}</div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-md pt-8 text-center">
            <p className="font-display text-2xl tracking-tight">Ask about this file</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {ready
                ? "Answers stay with this document. A citation jumps to the passage it came from."
                : failed
                  ? "This file could not be read, so chat stays closed."
                  : "Questions unlock when processing finishes."}
            </p>
            {ready && suggestions.length > 0 ? (
              <div className="mt-6 flex flex-col gap-2">
                {suggestions.map((question) => (
                  <Button
                    key={question}
                    type="button"
                    variant="outline"
                    className="h-auto justify-start px-3 py-2 text-left whitespace-normal"
                    onClick={() => onSend(question)}
                  >
                    {question}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {messages.map((message, index) => {
          const isLastAssistant = message.role === "assistant" && message.id === lastAssistant?.id;
          return (
            <article
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              aria-busy={message.status === "streaming"}
            >
              {message.role === "user" ? (
                <p className="max-w-[min(85%,28rem)] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-sm wrap-break-word whitespace-pre-wrap text-background">
                  {message.content}
                </p>
              ) : (
                <div className="min-w-0 max-w-full space-y-2">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{message.modelLabel || model?.name || "Model"}</span>
                    {message.status === "stopped" ? <span>Stopped</span> : null}
                    {message.status === "streaming" ? (
                      <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
                    ) : null}
                  </div>
                  {message.status === "not_found" ? (
                    <div
                      role="status"
                      className="rounded-2xl border border-dashed bg-muted/40 px-4 py-3"
                    >
                      <p className="font-medium">Not found in this document</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {message.notFoundMessage ||
                          "The file does not contain a passage that answers this."}
                      </p>
                    </div>
                  ) : (
                    <MessageBody
                      content={message.content || (message.status === "streaming" ? "…" : "")}
                      citations={message.citations}
                      onCitation={onCitation}
                    />
                  )}
                  {message.status === "error" ? (
                    <p role="alert" className="text-sm text-destructive">
                      {message.error || "The answer failed."}
                    </p>
                  ) : null}
                  {message.status !== "streaming" ? (
                    <div className="flex gap-1">
                      {message.content ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Copy answer"
                          onClick={() => {
                            void navigator.clipboard.writeText(message.content).then(
                              () => toast.success("Copied answer"),
                              () => toast.error("Could not copy"),
                            );
                          }}
                        >
                          <Copy />
                          Copy
                        </Button>
                      ) : null}
                      {isLastAssistant && index === messages.length - 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={onRegenerate}
                          disabled={streaming}
                        >
                          <RefreshCw />
                          Regenerate
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        className="border-t p-2.5 sm:p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="ask" className="sr-only">
          Ask this document
        </label>
        <div
          className={cn(
            "flex items-end gap-1 rounded-2xl border bg-card p-2 focus-within:ring-3 focus-within:ring-ring/40",
            speech.listening && "border-primary ring-3 ring-primary/20",
          )}
        >
          <Textarea
            id="ask"
            value={composerValue}
            disabled={!ready || streaming}
            rows={Math.min(6, Math.max(1, composerValue.split("\n").length))}
            placeholder={
              speech.listening ? "Listening…" : ready ? "Ask about this document" : statusLabel
            }
            className="max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            onChange={(event) => {
              if (speech.listening) speech.stop();
              setInterim("");
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {canUseMic ? (
            <Button
              type="button"
              size="icon"
              variant={speech.listening ? "default" : "ghost"}
              aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
              aria-pressed={speech.listening}
              className={cn(speech.listening && "animate-pulse")}
              onClick={() => {
                if (!speech.supported) {
                  toast.error("Voice input needs Chrome or Edge. This browser has no speech recognition.");
                  return;
                }
                if (speech.listening) {
                  speech.stop();
                  setInterim("");
                  return;
                }
                speech.start();
              }}
            >
              {speech.listening ? <MicOff /> : <Mic />}
            </Button>
          ) : null}
          {streaming ? (
            <Button type="button" size="icon" aria-label="Stop generating" onClick={onStop}>
              <Square />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              aria-label="Send"
              disabled={!ready || draft.trim().length === 0}
            >
              <Send />
            </Button>
          )}
        </div>
        <p className="px-1 pt-2 text-[11px] text-pretty text-muted-foreground">
          {speech.listening
            ? "Listening — click the mic to stop"
            : speech.supported
              ? "Enter to send · Shift+Enter for a new line · Mic for voice"
              : "Enter to send · Shift+Enter for a new line · Mic needs Chrome or Edge"}
        </p>
      </form>
    </section>
  );
}
