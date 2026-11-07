import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:43123";
const outDir = path.join(process.cwd(), "docs", "screenshots");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
await page.addInitScript(() => {
  window.localStorage.setItem("theme", "light");
});

await mkdir(outDir, { recursive: true });
await page.goto(baseUrl);
await page.getByRole("heading", { name: /chat with the page/i }).waitFor();
await page.waitForFunction(() => !document.body.innerText.includes("Loading…"));
await page.screenshot({ path: path.join(outDir, "landing.png") });

await page.getByRole("button", { name: /try the sample brief/i }).click();
const ask = page.getByLabel("Ask this document");
await ask.waitFor({ state: "visible" });
await page.waitForFunction(() => {
  const field = document.getElementById("ask");
  return field instanceof HTMLTextAreaElement && !field.disabled;
});
await page.getByRole("button", { name: /summarize/i }).click();
const citation = page.getByRole("button", { name: /citation 1/i });
await citation.waitFor();
await citation.click();
await page.locator(".passage-hit").waitFor();
await page.screenshot({ path: path.join(outDir, "workspace-citation.png") });

await page.getByRole("button", { name: "Model settings" }).click();
await page.getByRole("heading", { name: "Models" }).waitFor();
await page.screenshot({ path: path.join(outDir, "model-settings.png") });

await browser.close();
console.log(`Wrote screenshots to ${outDir}`);
