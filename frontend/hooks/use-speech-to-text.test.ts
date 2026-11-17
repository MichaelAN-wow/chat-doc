import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useSpeechToText } from "@/hooks/use-speech-to-text";

class FakeRecognition {
  static latest: FakeRecognition | null = null;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  constructor() {
    FakeRecognition.latest = this;
  }

  start() {
    this.started = true;
  }

  stop() {
    this.started = false;
  }

  abort() {
    this.started = false;
  }
}

describe("useSpeechToText", () => {
  afterEach(() => {
    FakeRecognition.latest = null;
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it("stays unsupported when the browser has no speech API", () => {
    const { result } = renderHook(() => useSpeechToText());
    expect(result.current.supported).toBe(false);
    expect(result.current.listening).toBe(false);
  });

  it("writes interim and final transcripts while listening", () => {
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
    const finals: string[] = [];
    const interims: string[] = [];
    const { result } = renderHook(() =>
      useSpeechToText({
        onFinal: (text) => finals.push(text),
        onInterim: (text) => interims.push(text),
      }),
    );

    act(() => {
      result.current.start();
    });
    expect(result.current.listening).toBe(true);
    expect(FakeRecognition.latest?.started).toBe(true);

    act(() => {
      FakeRecognition.latest?.onresult?.({
        resultIndex: 0,
        results: [
          { isFinal: false, 0: { transcript: "refund " } },
          { isFinal: true, 0: { transcript: "refund policy" } },
        ],
      });
    });

    expect(interims).toEqual(["refund "]);
    expect(finals).toEqual(["refund policy"]);
  });
});
