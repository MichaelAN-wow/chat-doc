import { describe, expect, it } from "vitest";

import { formatBytes, validateUpload } from "@/lib/files";

describe("validateUpload", () => {
  it("accepts markdown even when the browser leaves the mime blank", () => {
    const result = validateUpload({ name: "notes.md", size: 12, type: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extension).toBe(".md");
  });

  it("accepts pdf, txt, and docx", () => {
    expect(validateUpload({ name: "a.PDF", size: 10, type: "application/pdf" }).ok).toBe(true);
    expect(validateUpload({ name: "a.txt", size: 10, type: "text/plain" }).ok).toBe(true);
    expect(
      validateUpload({
        name: "a.docx",
        size: 10,
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }).ok,
    ).toBe(true);
  });

  it("rejects the wrong extension, an empty file, and files over 20 MB", () => {
    expect(
      validateUpload({ name: "virus.exe", size: 10, type: "application/octet-stream" }),
    ).toMatchObject({
      ok: false,
    });
    expect(validateUpload({ name: "empty.txt", size: 0, type: "text/plain" }).ok).toBe(false);
    expect(
      validateUpload({ name: "huge.pdf", size: 21 * 1024 * 1024, type: "application/pdf" }).ok,
    ).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
