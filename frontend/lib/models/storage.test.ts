import { beforeEach, describe, expect, it } from "vitest";

import { maskApiKey, seedConfigs, toModelRequest } from "@/lib/models/catalog";
import { loadModelState, saveModelState } from "@/lib/models/storage";

describe("model storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("masks keys and never puts them on the chat model payload", () => {
    const config = { ...seedConfigs()[0], apiKey: "sk-test-secret-1234" };
    expect(maskApiKey(config.apiKey)).toBe("••••••••1234");
    expect(maskApiKey("")).toBe("No key saved");
    expect(toModelRequest(config)).not.toHaveProperty("apiKey");
    expect(toModelRequest(config).provider).toBe("groq");
    expect(toModelRequest(config).model).toBe("openai/openai/gpt-oss-120b");
    expect(toModelRequest(config).baseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it("seeds Groq as the default active model", () => {
    const seeded = loadModelState();
    expect(seeded.configs[0]?.provider).toBe("groq");
    expect(seeded.configs[0]?.name).toMatch(/Groq/i);
    expect(seeded.activeId).toBe(seeded.configs[0]?.id);
  });

  it("round-trips configs and falls back when storage is corrupt", () => {
    const seeded = loadModelState();
    expect(seeded.configs.length).toBeGreaterThanOrEqual(3);
    saveModelState({
      activeId: seeded.configs[1].id,
      configs: [{ ...seeded.configs[1], apiKey: "sk-local" }],
    });
    expect(loadModelState().activeId).toBe(seeded.configs[1].id);
    expect(loadModelState().configs[0]?.apiKey).toBe("sk-local");

    window.localStorage.setItem("chatdoc.modelConfigs.v3", "{");
    expect(loadModelState().configs[0]?.provider).toBe("groq");
  });
});
