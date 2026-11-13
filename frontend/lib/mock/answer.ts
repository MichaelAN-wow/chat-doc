import type { Citation, DocumentPage } from "@/lib/api/types";

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "were",
  "what",
  "how",
  "does",
  "do",
  "did",
  "this",
  "that",
  "with",
  "from",
  "about",
  "please",
  "me",
  "my",
  "can",
  "you",
  "your",
  "i",
  "it",
  "its",
  "be",
  "as",
  "at",
  "by",
  "if",
  "we",
  "our",
]);

export type RankedPassage = {
  page: number;
  id: string;
  text: string;
  score: number;
};

export type MockAnswer =
  { kind: "not_found"; message: string } | { kind: "answer"; text: string; citations: Citation[] };

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function rankPassages(pages: DocumentPage[], question: string): RankedPassage[] {
  const tokens = tokenize(question);
  const summary = tokens.some((token) => token.startsWith("summar") || token === "overview");
  const ranked: RankedPassage[] = [];

  for (const page of pages) {
    for (const passage of page.passages) {
      const haystack = passage.text.toLowerCase();
      let score = summary ? 1 : 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += token.length > 5 ? 2 : 1;
      }
      if (score > 0) {
        ranked.push({ page: page.page, id: passage.id, text: passage.text, score });
      }
    }
  }

  return ranked.sort((a, b) => b.score - a.score || a.page - b.page);
}

function clip(text: string, length: number): string {
  const prose = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const flat = (prose.length > 0 ? prose.join(" ") : text).replace(/\s+/g, " ").trim();
  if (flat.length <= length) return flat;
  const slice = flat.slice(0, length);
  const stop = slice.lastIndexOf(". ");
  return `${(stop > 40 ? slice.slice(0, stop + 1) : slice).trim()}…`;
}

export function buildMockAnswer(input: {
  documentId: string;
  fileName: string;
  pages: DocumentPage[];
  question: string;
  topK: number;
  maxTokens: number;
  temperature: number;
}): MockAnswer {
  const ranked = rankPassages(input.pages, input.question);
  const best = ranked[0]?.score ?? 0;
  const summary = tokenize(input.question).some((token) => token.startsWith("summar"));

  if (!summary && best < 1) {
    return {
      kind: "not_found",
      message: `Not found in this document. ${input.fileName} does not appear to cover that, so there is no passage to cite.`,
    };
  }

  if (ranked.length === 0) {
    return {
      kind: "not_found",
      message: "Not found in this document. The file did not contain readable text.",
    };
  }

  const limit = Math.min(ranked.length, Math.max(1, input.topK), input.maxTokens < 180 ? 1 : 3);
  const chosen = ranked.slice(0, limit);
  const snippetLength = input.maxTokens < 280 ? 120 : 280;
  const hedge = input.temperature >= 0.8 ? "One reading of the file: " : "";

  const citations: Citation[] = chosen.map((passage, index) => ({
    index: index + 1,
    documentId: input.documentId,
    fileName: input.fileName,
    page: passage.page,
    passageId: passage.id,
    snippet: clip(passage.text, snippetLength),
  }));

  const opener = summary
    ? `${hedge}Here is a short reading of ${input.fileName}.`
    : `${hedge}${input.fileName} speaks to that in the passages below.`;

  const body = citations.map((citation) => `${citation.snippet} [${citation.index}]`).join("\n\n");

  return { kind: "answer", text: `${opener}\n\n${body}`, citations };
}
