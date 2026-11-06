import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModelSettings } from "@/components/settings/model-settings";
import { seedConfigs, type ModelState } from "@/lib/models/catalog";

describe("ModelSettings", () => {
  it("masks a stored API key and can add another configuration", async () => {
    const configs = seedConfigs();
    configs[0] = { ...configs[0], apiKey: "sk-test-secret-1234" };
    const state: ModelState = { configs, activeId: configs[0].id };
    const onChange = vi.fn();

    render(
      <ModelSettings
        open
        onOpenChange={() => undefined}
        state={state}
        onChange={onChange}
        onUse={() => undefined}
      />,
    );

    expect(document.body.textContent).toContain("1234");
    expect(document.body.textContent).not.toContain("sk-test-secret-1234");

    await userEvent.click(screen.getByRole("button", { name: /add model/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0] as ModelState;
    expect(next.configs).toHaveLength(configs.length + 1);
  });
});
