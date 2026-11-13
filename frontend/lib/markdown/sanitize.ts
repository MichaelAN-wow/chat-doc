/** Protect fenced/inline code, then strip literal HTML that models leak into prose. */

const CODE_OR_FENCE =
  /(```[\w.-]*\r?\n[\s\S]*?```|~~~[\w.-]*\r?\n[\s\S]*?~~~|`[^`\n]+`)/g;

const BR_TAG = /<br\s*\/?>/gi;
const HTML_TAG =
  /<\/?(?:p|div|span|section|article|header|footer|main|nav|aside|strong|b|em|i|u|s|ul|ol|li|h[1-6]|font|center|table|thead|tbody|tfoot|tr|td|th|a|img|hr|blockquote|pre|code|sup|sub|small|label|button|form|input|textarea|select|option|br)(?:\s[^>]*)?\/?>/gi;

function sanitizeProseSegment(segment: string): string {
  return segment
    .split("\n")
    .map((line) => {
      const inTableRow = /^\s*\|/.test(line);
      // Tables must stay single-line; use a separator instead of a real newline.
      let next = line.replace(BR_TAG, inTableRow ? " · " : "\n");
      next = next.replace(HTML_TAG, "");
      return next;
    })
    .join("\n");
}

/** Convert leaked HTML breaks/tags in markdown; leave real code fences and inline code alone. */
export function sanitizeMarkdownHtml(markdown: string): string {
  if (!markdown || !/[<]/.test(markdown)) return markdown;

  const blocks: string[] = [];
  const withPlaceholders = markdown.replace(CODE_OR_FENCE, (block) => {
    blocks.push(block);
    return `\0CODE${blocks.length - 1}\0`;
  });

  const cleaned = sanitizeProseSegment(withPlaceholders);
  return cleaned.replace(/\0CODE(\d+)\0/g, (_match, index: string) => blocks[Number(index)] ?? "");
}
