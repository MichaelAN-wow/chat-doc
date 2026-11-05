"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { DocumentSummary, DocumentText } from "@/lib/api/types";

type DocumentBucket = {
  id: string;
  record: DocumentSummary | null;
  error: string | null;
  loading: boolean;
};

export function useDocumentRecord(id: string) {
  const [bucket, setBucket] = useState<DocumentBucket>({
    id,
    record: null,
    error: null,
    loading: true,
  });

  if (bucket.id !== id) {
    setBucket({ id, record: null, error: null, loading: true });
  }

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    async function tick() {
      try {
        const next = await api.getStatus(id);
        if (cancelled) return;
        setBucket({ id, record: next, error: null, loading: false });
        if (next.status === "pending" || next.status === "processing") {
          timer = window.setTimeout(() => {
            void tick();
          }, 700);
        }
      } catch (err) {
        if (cancelled) return;
        setBucket({
          id,
          record: null,
          error: err instanceof Error ? err.message : "Could not load the document.",
          loading: false,
        });
      }
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id]);

  return { record: bucket.record, error: bucket.error, loading: bucket.loading };
}

export function useDocumentContent(record: DocumentSummary | null) {
  const [text, setText] = useState<DocumentText | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordId = record?.id ?? null;
  const status = record?.status ?? null;

  useEffect(() => {
    if (!recordId) return;
    let cancelled = false;
    void api.documentFileUrl(recordId).then((url) => {
      if (!cancelled) setFileUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  useEffect(() => {
    if (!recordId || status !== "ready") return;
    let cancelled = false;
    Promise.all([api.getDocumentText(recordId), api.getSuggestions(recordId)])
      .then(([nextText, nextQuestions]) => {
        if (cancelled) return;
        setText(nextText);
        setQuestions(nextQuestions);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not read the document.");
      });
    return () => {
      cancelled = true;
    };
  }, [recordId, status]);

  return { text, questions, fileUrl, error };
}
