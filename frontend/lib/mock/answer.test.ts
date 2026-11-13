import { describe, expect, it } from "vitest";

import { buildMockAnswer } from "@/lib/mock/answer";
import { paginateMarkdown, suggestQuestions } from "@/lib/mock/passages";

const source = `# Harbor guide

Intro for analysts.

## Refund policy

Customers may request a refund within 30 days of purchase.

## Reading room hours

The reading room is open Monday through Friday.
`;

describe("mock answers", () => {
  const pages = paginateMarkdown(source);

  it("cites the refund passage and skips questions the file does not cover", () => {
    const found = buildMockAnswer({
      documentId: "doc_1",
      fileName: "harbor-brief.md",
      pages,
      question: "What is the refund window?",
      topK: 3,
      maxTokens: 800,
      temperature: 0.2,
    });
    expect(found.kind).toBe("answer");
    if (found.kind !== "answer") return;
    expect(found.text).toContain("[1]");
    expect(found.citations[0]?.snippet.toLowerCase()).toContain("30 days");

    const missing = buildMockAnswer({
      documentId: "doc_1",
      fileName: "harbor-brief.md",
      pages,
      question: "What is the capital of France?",
      topK: 3,
      maxTokens: 800,
      temperature: 0.2,
    });
    expect(missing.kind).toBe("not_found");
  });

  it("honors a small top-k and always offers three suggestions", () => {
    const answer = buildMockAnswer({
      documentId: "doc_1",
      fileName: "harbor-brief.md",
      pages,
      question: "Summarize the harbor guide",
      topK: 1,
      maxTokens: 800,
      temperature: 0.2,
    });
    expect(answer.kind).toBe("answer");
    if (answer.kind === "answer") expect(answer.citations).toHaveLength(1);
    expect(suggestQuestions("harbor-brief.md", pages)).toHaveLength(3);
  });
});
