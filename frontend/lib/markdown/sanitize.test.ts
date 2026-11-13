import { describe, expect, it } from "vitest";

import { sanitizeMarkdownHtml } from "@/lib/markdown/sanitize";

describe("sanitizeMarkdownHtml", () => {
  it("turns prose <br> into newlines", () => {
    expect(sanitizeMarkdownHtml("one<br>two<br/>three")).toBe("one\ntwo\nthree");
  });

  it("keeps table rows on one line", () => {
    const input =
      "| Role | Duties |\n| --- | --- |\n| SME | • A<br>• B<br/>• C |";
    const out = sanitizeMarkdownHtml(input);
    expect(out).toContain("| SME | • A · • B · • C |");
    expect(out).not.toMatch(/<br/i);
  });

  it("leaves fenced and inline code alone", () => {
    const input = "See `<br>` and:\n```html\n<br>\n```\nDone<br>here";
    const out = sanitizeMarkdownHtml(input);
    expect(out).toContain("`<br>`");
    expect(out).toContain("```html\n<br>\n```");
    expect(out).toContain("Done\nhere");
  });

  it("strips other leaked tags while keeping text", () => {
    expect(sanitizeMarkdownHtml("<p>Hello</p> <div>world</div>")).toBe("Hello world");
  });
});
