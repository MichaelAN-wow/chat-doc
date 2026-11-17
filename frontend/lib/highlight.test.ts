import { describe, expect, it } from "vitest";

import { markSnippet } from "@/lib/highlight";

describe("markSnippet", () => {
  it("marks the spans that contain the citation snippet", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>Refunds take </span><span>30 days of purchase.</span>";
    document.body.append(root);

    expect(markSnippet(root, "Refunds take 30 days")).toBe(true);
    expect(root.querySelectorAll(".chatdoc-hit").length).toBeGreaterThan(0);

    root.remove();
  });
});
