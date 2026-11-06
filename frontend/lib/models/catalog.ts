import type { ModelRequest, ProviderId, ProviderInfo } from "@/lib/api/types";

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "groq",
    label: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    suggestedModels: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    notes: "OpenAI-compatible Groq API. Server uses OPENAI_API_KEY + OPENAI_API_BASE from .env.",
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    suggestedModels: [
      "nvidia/nemotron-3.5-bolt-e4b",
      "nvidia/nemotron-3.5-lightning-30b-a3b",
      "poolside/laguna-xs-2.1",
    ],
    notes: "NVIDIA Build / NIM. Server uses NVIDIA_API_KEY from backend .env.",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
    notes: "Chat Completions compatible endpoint. Server uses OPENAI_API_KEY.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    suggestedModels: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
    notes: "Messages API via LiteLLM. Server uses ANTHROPIC_API_KEY.",
  },
  {
    id: "google",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    notes: "Gemini API via LiteLLM. Server uses GEMINI_API_KEY.",
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    defaultBaseUrl: "https://YOUR_RESOURCE.openai.azure.com",
    suggestedModels: ["gpt-4o"],
    notes: "Use your resource endpoint. The model field is the deployment name.",
  },
  {
    id: "ollama",
    label: "Ollama",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    suggestedModels: ["llama3.1", "mistral", "qwen2.5"],
    notes: "Local OpenAI-compatible server. No key required.",
  },
  {
    id: "openai-compatible",
    label: "Custom OpenAI-compatible",
    defaultBaseUrl: "https://api.example.com/v1",
    suggestedModels: ["custom-model"],
    notes: "Any server that speaks the OpenAI chat completions schema.",
  },
];

export function providerById(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

export type ModelConfig = {
  id: string;
  name: string;
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  topK: number;
  createdAt: string;
  updatedAt: string;
};

export type ModelState = {
  configs: ModelConfig[];
  activeId: string;
};

export function toModelRequest(config: ModelConfig): ModelRequest {
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl.trim() || undefined,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    topK: config.topK,
  };
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return "No key saved";
  if (trimmed.length <= 4) return "••••";
  return `••••••••${trimmed.slice(-4)}`;
}

export function seedConfigs(now = "2026-01-01T00:00:00.000Z"): ModelConfig[] {
  return [
    {
      id: "model_groq_default",
      name: "Groq · GPT-OSS 120B",
      provider: "groq",
      model: "openai/openai/gpt-oss-120b",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "",
      temperature: 0.2,
      maxTokens: 1200,
      topK: 8,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "model_nvidia_default",
      name: "NVIDIA · Nemotron 3.5 Bolt",
      provider: "nvidia",
      model: "nvidia/nemotron-3.5-bolt-e4b",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: "",
      temperature: 0.2,
      maxTokens: 1200,
      topK: 8,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "model_openai_default",
      name: "OpenAI · GPT-4o",
      provider: "openai",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      temperature: 0.2,
      maxTokens: 1200,
      topK: 8,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "model_anthropic_default",
      name: "Anthropic · Claude Sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      temperature: 0.3,
      maxTokens: 1200,
      topK: 8,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "model_ollama_default",
      name: "Ollama · Llama 3.1",
      provider: "ollama",
      model: "llama3.1",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "",
      temperature: 0.4,
      maxTokens: 1200,
      topK: 4,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
