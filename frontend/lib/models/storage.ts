import { seedConfigs, type ModelConfig, type ModelState } from "@/lib/models/catalog";

const STORAGE_KEY = "chatdoc.modelConfigs.v3";

const listeners = new Set<() => void>();
let snapshot: ModelState | null = null;

let serverSnapshot: ModelState | null = null;

export function serverModelState(): ModelState {
  serverSnapshot ??= defaultModelState();
  return serverSnapshot;
}

export function subscribeModels(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadModelSnapshot(): ModelState {
  if (!snapshot) snapshot = loadModelState();
  return snapshot;
}

function isConfig(value: unknown): value is ModelConfig {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ModelConfig>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.provider === "string" &&
    typeof record.model === "string" &&
    typeof record.baseUrl === "string" &&
    typeof record.apiKey === "string" &&
    typeof record.temperature === "number" &&
    typeof record.maxTokens === "number" &&
    typeof record.topK === "number"
  );
}

export function defaultModelState(): ModelState {
  const configs = seedConfigs();
  return { configs, activeId: configs[0].id };
}

export function loadModelState(): ModelState {
  if (typeof window === "undefined") return defaultModelState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultModelState();
    const parsed = JSON.parse(raw) as Partial<ModelState>;
    const configs = Array.isArray(parsed.configs) ? parsed.configs.filter(isConfig) : [];
    if (configs.length === 0) return defaultModelState();
    const activeId = configs.some((config) => config.id === parsed.activeId)
      ? (parsed.activeId as string)
      : configs[0].id;
    return { configs, activeId };
  } catch {
    return defaultModelState();
  }
}

export function saveModelState(state: ModelState): void {
  snapshot = state;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((listener) => listener());
}

export function resolveConfig(state: ModelState, preferredId?: string | null): ModelConfig {
  return (
    state.configs.find((config) => config.id === preferredId) ??
    state.configs.find((config) => config.id === state.activeId) ??
    state.configs[0]
  );
}
