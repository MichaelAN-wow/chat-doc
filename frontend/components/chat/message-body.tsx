"use client";

import type { Components } from "react-markdown";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CitationChip } from "@/components/chat/citation-chip";
import type { Citation } from "@/lib/api/types";
import { sanitizeMarkdownHtml } from "@/lib/markdown/sanitize";

/** Simple [1] and model formats like 【1†L1-L9】 → source number only. */
const CITE_MARKER = /[\[［【〔]\s*(\d+)(?:\s*[†‡*\u2020\u2021][^\]]*?)?\s*[\]］】〕]/g;
const TRAILING_RUN =
  /((?:\s*[\[［【〔]\s*\d+(?:\s*[†‡*\u2020\u2021][^\]]*?)?\s*[\]］】〕])+)([\s.。!！?？]*)\s*$/;

function runMarkers(run: string): RegExpMatchArray[] {
  return [
    ...run.matchAll(/[\[［【〔]\s*(\d+)(?:\s*[†‡*\u2020\u2021][^\]]*?)?\s*[\]］】〕]/g),
  ];
}

function countsUp(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

/** Drop a dumped source list at the end, and keep a citation that closes the sentence. */
function splitTrailingCitations(content: string): string {
  const trimmed = content.replace(/\s+$/, "");
  const match = trimmed.match(TRAILING_RUN);
  if (!match || match.index === undefined || match.index === 0) return content;

  const run = match[1] ?? "";
  const markers = runMarkers(run);
  const indexes = markers.map((item) => Number(item[1]));
  if (indexes.length < 2) return content;

  let dumpCount = 0;
  const restart = indexes.lastIndexOf(1);
  if (restart >= 0) {
    const suffix = indexes.slice(restart);
    if (countsUp(suffix) && suffix.length >= 2 && (restart > 0 || suffix.length === indexes.length)) {
      dumpCount = suffix.length;
    }
  }
  if (dumpCount === 0 && indexes.length >= 4) dumpCount = indexes.length;
  if (dumpCount < 2) return content;

  const cut = markers[markers.length - dumpCount];
  if (!cut || cut.index === undefined) return content;

  const kept = run.slice(0, cut.index).trim();
  const before = trimmed.slice(0, match.index).replace(/\s+$/, "");
  const punct = (match[2] ?? "").replace(/\s/g, "");
  let body = kept ? `${before} ${kept}` : before;
  if (punct && !/[.。!！?？]$/.test(body)) body += punct[0];
  return body;
}

export function MessageBody({
  content,
  citations,
  onCitation,
}: {
  content: string;
  citations: Citation[];
  onCitation: (citation: Citation) => void;
}) {
  const body = sanitizeMarkdownHtml(splitTrailingCitations(content));
  const knownIndexes = new Set(citations.map((item) => item.index));
  // Only link markers that have a real source — drop orphan [n] chips with no payload.
  const withLinks = body.replace(CITE_MARKER, (match, number: string) => {
    const index = Number(number);
    return knownIndexes.has(index) ? `[${number}](cite:${number})` : "";
  });
  const sources = [...citations].sort((a, b) => a.index - b.index);

  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith("cite:")) {
        const index = Number(href.slice(5));
        const citation = citations.find((item) => item.index === index);
        if (!citation) return null;
        return (
          <CitationChip
            index={index}
            citation={citation}
            onClick={() => {
              onCitation(citation);
            }}
          />
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {children}
        </a>
      );
    },
    table: ({ children }) => (
      <div className="my-3 max-w-full overflow-x-auto">
        <table className="w-full border-collapse border border-foreground/25 text-[0.9em]">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
    th: ({ children }) => (
      <th className="border border-foreground/25 px-2.5 py-1.5 text-left align-top font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-foreground/25 px-2.5 py-1.5 text-left align-top whitespace-pre-line">
        {children}
      </td>
    ),
  };

  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={(url) => (url.startsWith("cite:") ? url : defaultUrlTransform(url))}
      >
        {withLinks}
      </ReactMarkdown>
      {sources.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-muted-foreground">Sources</span>
          {sources.map((citation) => (
            <CitationChip
              key={citation.index}
              index={citation.index}
              citation={citation}
              placement="row"
              onClick={() => onCitation(citation)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
