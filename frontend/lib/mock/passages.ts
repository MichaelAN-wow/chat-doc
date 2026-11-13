import type { DocumentPage, Passage } from "@/lib/api/types";

function wrapSplit(text: string, size: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= size) return [trimmed];

  const parts: string[] = [];
  let rest = trimmed;
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(". "));
    const cut = breakAt > size * 0.4 ? breakAt + 1 : size;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function splitPassages(prefix: string, text: string): Passage[] {
  const chunks = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const source = chunks.length > 0 ? chunks : [text.trim()].filter(Boolean);
  const passages: Passage[] = [];

  source.forEach((chunk, chunkIndex) => {
    wrapSplit(chunk, 700).forEach((part, partIndex) => {
      passages.push({ id: `${prefix}-${chunkIndex}-${partIndex}`, text: part });
    });
  });

  return passages;
}

export function paginateMarkdown(text: string): DocumentPage[] {
  const parts = text
    .replace(/^\uFEFF/, "")
    .split(/\n(?=#{1,3}\s)/)
    .map((part) => part.trim())
    .filter(Boolean);
  const sections = parts.length > 0 ? parts : [text.trim()].filter(Boolean);
  return sections
    .map((section, index) => ({
      page: index + 1,
      passages:
        section.length > 900
          ? splitPassages(`p${index + 1}`, section)
          : [{ id: `p${index + 1}-0-0`, text: section }],
    }))
    .filter((page) => page.passages.length > 0);
}

export function paginatePlain(text: string): DocumentPage[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rawPages = cleaned
    .split("\f")
    .map((page) => page.trim())
    .filter(Boolean);
  const pages = rawPages.length > 1 ? rawPages : chunkByLength(cleaned, 1600);
  return pages
    .map((page, index) => ({
      page: index + 1,
      passages: splitPassages(`p${index + 1}`, page),
    }))
    .filter((page) => page.passages.length > 0);
}

function chunkByLength(text: string, size: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= size) return [trimmed];
  const chunks: string[] = [];
  let rest = trimmed;
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const breakAt = window.lastIndexOf("\n");
    const cut = breakAt > size * 0.4 ? breakAt : size;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function suggestQuestions(fileName: string, pages: DocumentPage[]): string[] {
  const headings = pages
    .flatMap((page) => page.passages.map((passage) => passage.text))
    .map((text) => text.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));

  const title = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  const questions: string[] = [`Summarize ${title}.`];
  if (headings[0]) questions.push(`What does “${headings[0]}” say?`);
  if (headings[1]) questions.push(`Explain “${headings[1]}”.`);
  while (questions.length < 3) {
    questions.push("What are the key points in this document?");
  }
  return questions.slice(0, 3);
}
