import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatPanel } from "@/components/chat/chat-panel";
import { MessageBody } from "@/components/chat/message-body";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Citation } from "@/lib/api/types";
import type { ChatMessage } from "@/lib/chat/storage";

const citation: Citation = {
  index: 1,
  documentId: "doc_1",
  fileName: "harbor-brief.md",
  page: 2,
  passageId: "p2-0-0",
  snippet: "Customers may request a refund within 30 days.",
};

describe("MessageBody", () => {
  it("turns a citation marker into a button", async () => {
    const onCitation = vi.fn();
    render(
      <TooltipProvider>
        <MessageBody
          content="Refunds are available for 30 days [1]."
          citations={[citation]}
          onCitation={onCitation}
        />
      </TooltipProvider>,
    );
    const buttons = screen.getAllByRole("button", { name: /source 1/i });
    await userEvent.click(buttons[0]);
    expect(onCitation).toHaveBeenCalledWith(citation);
  });

  it("keeps in-sentence markers as buttons and a source sequence after the answer", () => {
    const second: Citation = { ...citation, index: 5, page: 4, snippet: "Java experience." };
    const view = render(
      <TooltipProvider>
        <MessageBody
          content="Reliability holds 【4】. Java is listed [5] [1] [2] [3] [4] [5]."
          citations={[citation, second]}
          onCitation={vi.fn()}
        />
      </TooltipProvider>,
    );
    const scope = within(view.container);
    expect(scope.getByText(/Reliability holds/)).toBeTruthy();
    expect(scope.getByText(/Java is listed/)).toBeTruthy();
    expect(view.container.textContent).toMatch(/Java is listed\s*5\s*\./);
    expect(scope.queryByText("[1]")).toBeNull();
    expect(scope.getByText("Sources")).toBeTruthy();
    // Orphan [4] has no citation payload — do not render a dead chip.
    expect(scope.queryByRole("button", { name: /source 4/i })).toBeNull();
    expect(scope.getAllByRole("button", { name: /source 5/i })).toHaveLength(2);
    expect(scope.getAllByRole("button", { name: /source 1/i })).toHaveLength(1);
    expect(scope.queryByRole("button", { name: /source 2/i })).toBeNull();
  });

  it("turns technical model cites into plain source buttons", () => {
    render(
      <TooltipProvider>
        <MessageBody
          content="Current role at Flatiron Health【1†L1-L9】【5†L1-L8】."
          citations={[citation, { ...citation, index: 5, page: 1 }]}
          onCitation={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText(/†L1/)).toBeNull();
    expect(screen.queryByText(/【1/)).toBeNull();
    expect(screen.getAllByRole("button", { name: /source 1/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /source 5/i }).length).toBeGreaterThan(0);
  });

  it("filters leaked HTML breaks outside code", () => {
    const view = render(
      <TooltipProvider>
        <MessageBody
          content={"Duty A<br>Duty B\n\nKeep `<br>` literal."}
          citations={[]}
          onCitation={vi.fn()}
        />
      </TooltipProvider>,
    );
    const text = view.container.textContent ?? "";
    expect(text).toMatch(/Duty A/);
    expect(text).toMatch(/Duty B/);
    expect(text).not.toMatch(/Duty A<br/i);
    expect(text).toMatch(/Keep <br> literal/);
  });
});

describe("ChatPanel", () => {
  const base = {
    streaming: false,
    ready: true,
    failed: false,
    statusLabel: "Ready",
    suggestions: [],
    model: null,
    onSend: vi.fn(),
    onStop: vi.fn(),
    onRegenerate: vi.fn(),
    onCitation: vi.fn(),
    modelControl: null,
  };

  it("shows the not-found state and offers regenerate", async () => {
    const onRegenerate = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "What is the capital of France?",
        citations: [],
        status: "complete",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "a1",
        role: "assistant",
        content: "",
        citations: [],
        status: "not_found",
        notFoundMessage: "Not found in this document.",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ];
    render(<ChatPanel {...base} messages={messages} onRegenerate={onRegenerate} />);
    expect(screen.getByRole("status")).toHaveTextContent(/not found in this document/i);
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    expect(onRegenerate).toHaveBeenCalled();
  });
});
