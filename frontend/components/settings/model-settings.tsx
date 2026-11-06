"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { ProviderId } from "@/lib/api/types";
import {
  maskApiKey,
  providerById,
  PROVIDERS,
  type ModelConfig,
  type ModelState,
} from "@/lib/models/catalog";

export function ModelSettings({
  open,
  onOpenChange,
  state,
  onChange,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ModelState;
  onChange: (state: ModelState) => void;
  onUse: (id: string) => void;
}) {
  const current = state.configs.find((config) => config.id === state.activeId) ?? state.configs[0];
  const [draft, setDraft] = useState<ModelConfig>(current);
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function select(id: string) {
    const config = state.configs.find((item) => item.id === id);
    if (!config) return;
    setDraft({ ...config });
    setKeyInput("");
    setError("");
    setSaved(false);
    setConfirmRemove(false);
  }

  function updateDraft(partial: Partial<ModelConfig>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
    setSaved(false);
  }

  function save(): boolean {
    if (!draft.name.trim() || !draft.model.trim()) {
      setError("Give the configuration a name and a model id.");
      return false;
    }
    if (draft.baseUrl.trim() && !/^https?:\/\//i.test(draft.baseUrl.trim())) {
      setError("Base URL must start with http:// or https://.");
      return false;
    }
    if (draft.temperature < 0 || draft.temperature > 2) {
      setError("Temperature needs to be between 0 and 2.");
      return false;
    }
    if (draft.maxTokens < 1 || draft.maxTokens > 32000 || draft.topK < 1 || draft.topK > 20) {
      setError("Max tokens must be 1–32000 and top-k must be 1–20.");
      return false;
    }

    const nextConfig: ModelConfig = {
      ...draft,
      name: draft.name.trim(),
      model: draft.model.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: keyInput.trim() ? keyInput.trim() : draft.apiKey,
      updatedAt: new Date().toISOString(),
    };
    const exists = state.configs.some((config) => config.id === nextConfig.id);
    const configs = exists
      ? state.configs.map((config) => (config.id === nextConfig.id ? nextConfig : config))
      : [...state.configs, nextConfig];
    onChange({ configs, activeId: state.activeId });
    setDraft(nextConfig);
    setKeyInput("");
    setError("");
    setSaved(true);
    return true;
  }

  function add() {
    const now = new Date().toISOString();
    const provider = providerById("openai");
    const config: ModelConfig = {
      id: `model_${crypto.randomUUID()}`,
      name: "New model",
      provider: "openai",
      model: provider.suggestedModels[0],
      baseUrl: provider.defaultBaseUrl,
      apiKey: "",
      temperature: 0.2,
      maxTokens: 1200,
      topK: 5,
      createdAt: now,
      updatedAt: now,
    };
    onChange({ configs: [...state.configs, config], activeId: state.activeId });
    setDraft(config);
    setKeyInput("");
    setError("");
    setSaved(false);
  }

  function remove() {
    if (state.configs.length <= 1) {
      setError("Keep at least one model.");
      return;
    }
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    const configs = state.configs.filter((config) => config.id !== draft.id);
    const activeId = state.activeId === draft.id ? configs[0].id : state.activeId;
    onChange({ configs, activeId });
    setDraft({ ...configs[0] });
    setConfirmRemove(false);
    setKeyInput("");
  }

  const suggestions = draft ? providerById(draft.provider).suggestedModels : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(760px,calc(100dvh-2rem))] w-[min(52rem,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0 sm:max-w-none!">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Models</DialogTitle>
          <DialogDescription>
            Answers come from the server model. This panel stores presets in the browser and sends
            top-K with each question. API keys stay on this device and are never sent.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="border-b p-3 md:border-r md:border-b-0">
            <Button type="button" variant="outline" className="mb-2 w-full" onClick={add}>
              Add model
            </Button>
            <ul className="max-h-40 space-y-1 overflow-y-auto md:max-h-[420px]">
              {state.configs.map((config) => (
                <li key={config.id}>
                  <button
                    type="button"
                    onClick={() => select(config.id)}
                    className={`w-full rounded-lg px-2 py-2 text-left text-sm ${
                      config.id === draft.id ? "bg-muted" : "hover:bg-muted/60"
                    }`}
                  >
                    <span className="block truncate font-medium">{config.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {providerById(config.provider).label}
                      {config.id === state.activeId ? " · active" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <form
            className="min-h-0 space-y-4 overflow-y-auto px-5 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="model-name">Name</Label>
                <Input
                  id="model-name"
                  value={draft.name}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model-provider">Provider</Label>
                <Select
                  value={draft.provider}
                  onValueChange={(value) => {
                    const provider = value as ProviderId;
                    const info = providerById(provider);
                    updateDraft({
                      provider,
                      baseUrl: info.defaultBaseUrl,
                      model: info.suggestedModels[0] ?? draft.model,
                    });
                  }}
                >
                  <SelectTrigger id="model-provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-id">Model id</Label>
              <Input
                id="model-id"
                list="model-suggestions"
                value={draft.model}
                onChange={(event) => updateDraft({ model: event.target.value })}
              />
              <datalist id="model-suggestions">
                {suggestions.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">{providerById(draft.provider).notes}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-base-url">Base URL</Label>
              <Input
                id="model-base-url"
                value={draft.baseUrl}
                onChange={(event) => updateDraft({ baseUrl: event.target.value })}
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-api-key">API key</Label>
              <Input
                id="model-api-key"
                type="password"
                autoComplete="off"
                value={keyInput}
                placeholder={
                  draft.apiKey
                    ? `${maskApiKey(draft.apiKey)} — leave blank to keep`
                    : "Optional in mock mode"
                }
                onChange={(event) => setKeyInput(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Stored as {maskApiKey(keyInput.trim() || draft.apiKey)}. In production the key
                belongs in the backend or a secret store, not in the browser.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="model-temperature">Temperature</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {draft.temperature.toFixed(1)}
                </span>
              </div>
              <Slider
                id="model-temperature"
                min={0}
                max={2}
                step={0.1}
                value={[draft.temperature]}
                onValueChange={(value) => updateDraft({ temperature: value[0] ?? 0 })}
                aria-label="Temperature"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="model-max-tokens">Max tokens</Label>
                <Input
                  id="model-max-tokens"
                  type="number"
                  min={1}
                  max={32000}
                  value={draft.maxTokens}
                  onChange={(event) => updateDraft({ maxTokens: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model-top-k">Top-k</Label>
                <Input
                  id="model-top-k"
                  type="number"
                  min={1}
                  max={20}
                  value={draft.topK}
                  onChange={(event) => updateDraft({ topK: Number(event.target.value) })}
                />
              </div>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Saved in this browser.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit">Save</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (save()) onUse(draft.id);
                }}
              >
                Use for this chat
              </Button>
              <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
                {confirmRemove ? "Confirm remove" : "Remove"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
