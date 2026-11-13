export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function markSnippet(container: HTMLElement, snippet: string): boolean {
  container.querySelectorAll(".chatdoc-hit").forEach((node) => {
    node.classList.remove("chatdoc-hit");
  });

  const needle = normalize(snippet).slice(0, 64);
  if (needle.length < 6) return false;

  const spans = Array.from(container.querySelectorAll("span"));
  if (spans.length === 0) return false;

  let normalized = "";
  const owners: number[] = [];

  spans.forEach((span, spanIndex) => {
    const text = span.textContent ?? "";
    for (const character of text) {
      if (/\s/.test(character)) {
        if (normalized.endsWith(" ") || normalized.length === 0) continue;
        normalized += " ";
        owners.push(spanIndex);
      } else {
        normalized += character.toLowerCase();
        owners.push(spanIndex);
      }
    }
    if (normalized.length > 0 && !normalized.endsWith(" ")) {
      normalized += " ";
      owners.push(spanIndex);
    }
  });

  const index = normalized.indexOf(needle);
  if (index < 0) return false;

  const hits = new Set<number>();
  for (let cursor = index; cursor < index + needle.length && cursor < owners.length; cursor += 1) {
    hits.add(owners[cursor]);
  }

  hits.forEach((spanIndex) => {
    spans[spanIndex]?.classList.add("chatdoc-hit");
  });

  return hits.size > 0;
}
