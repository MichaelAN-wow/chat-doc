"use client";

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Citation, DocumentText } from "@/lib/api/types";
import { scrollBehavior } from "@/lib/highlight";
import { sanitizeMarkdownHtml } from "@/lib/markdown/sanitize";
import { cn } from "@/lib/utils";

export function TextViewer({
  text,
  markdown,
  highlight,
}: {
  text: DocumentText;
  markdown: boolean;
  highlight: Citation | null;
}) {
  useEffect(() => {
    if (!highlight) return;
    const node = document.getElementById(`passage-${highlight.passageId}`);
    node?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  }, [highlight]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8">
      {text.pages.map((page) => (
        <section key={page.page} aria-label={`Section ${page.page}`} className="space-y-3">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Section {page.page}
          </p>
          {page.passages.map((passage) => {
            const active = highlight?.passageId === passage.id;
            return (
              <div
                key={passage.id}
                id={`passage-${passage.id}`}
                className={cn("rounded-xl px-4 py-3 text-sm leading-7", active && "passage-hit")}
              >
                {markdown ? (
                  <div className="prose-chat">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
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
                      }}
                    >
                      {sanitizeMarkdownHtml(passage.text)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{passage.text}</p>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
