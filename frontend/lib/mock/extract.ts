import "server-only";

import { extensionOf } from "@/lib/files";
import type { DocumentPage } from "@/lib/api/types";
import { paginateMarkdown, paginatePlain, splitPassages } from "@/lib/mock/passages";

let pdfReady: Promise<void> | null = null;

async function extractPdf(data: Buffer): Promise<DocumentPage[]> {
  const { definePDFJSModule, extractText } = await import("unpdf");
  pdfReady ??= definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
  await pdfReady;
  const result = await extractText(new Uint8Array(data), { mergePages: false });
  const pages = Array.isArray(result.text) ? result.text : [result.text];
  return pages
    .map((text, index) => ({
      page: index + 1,
      passages: splitPassages(`p${index + 1}`, text || ""),
    }))
    .filter((page) => page.passages.length > 0);
}

async function extractDocx(data: Buffer): Promise<DocumentPage[]> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: data });
  return paginatePlain(result.value || "");
}

export async function extractPages(
  fileName: string,
  mimeType: string,
  data: Buffer,
): Promise<DocumentPage[]> {
  const extension = extensionOf(fileName);
  if (extension === ".pdf" || mimeType === "application/pdf") {
    return extractPdf(data);
  }
  if (extension === ".docx") {
    return extractDocx(data);
  }
  const text = data.toString("utf8");
  if (extension === ".md" || extension === ".markdown" || mimeType.includes("markdown")) {
    return paginateMarkdown(text);
  }
  return paginatePlain(text);
}
