import { describe, expect, it } from "vitest";

import { consumeSseBuffer, decodeChatEvent, encodeSse } from "@/lib/api/sse";

describe("sse", () => {
  it("splits a partial buffer and keeps the trailing fragment", () => {
    const first = consumeSseBuffer(
      'event: token\ndata: {"delta":"Hi"}\n\nevent: token\ndata: {"del',
    );
    expect(first.events).toEqual([{ event: "token", data: '{"delta":"Hi"}' }]);
    expect(first.rest).toContain("del");

    const second = consumeSseBuffer(`${first.rest}ta":" there"}\n\n`);
    expect(decodeChatEvent(second.events[0])).toEqual({ type: "token", delta: " there" });
  });

  it("decodes citations, not-found, and done events", () => {
    const citation = decodeChatEvent({
      event: "citation",
      data: JSON.stringify({
        index: 1,
        documentId: "doc_1",
        fileName: "brief.md",
        page: 2,
        passageId: "p2",
        snippet: "Refunds",
      }),
    });
    expect(citation).toMatchObject({ type: "citation", citation: { index: 1, page: 2 } });

    expect(
      decodeChatEvent({
        event: "not_found",
        data: encodeSse("not_found", { message: "Missing" }).split("data: ")[1].trim(),
      }),
    ).toMatchObject({
      type: "not_found",
    });
  });
});
