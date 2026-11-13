"use client";

import type { Citation } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CitationChip({
  index,
  citation,
  onClick,
  placement = "inline",
}: {
  index: number;
  citation?: Citation;
  onClick: () => void;
  placement?: "inline" | "row";
}) {
  const label = citation
    ? `Open source ${index}: ${citation.fileName}, page ${citation.page}`
    : `Open source ${index}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "h-6 min-w-6 rounded-md px-1.5 text-xs font-semibold tabular-nums",
            placement === "inline" ? "mx-0.5 align-middle" : "",
          )}
        >
          {index}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <span className="block font-medium">
          {citation ? `${citation.fileName} · page ${citation.page}` : `Source ${index}`}
        </span>
        <span className="mt-0.5 block text-[11px] opacity-80">Click to open in the document</span>
        {citation ? (
          <span className="mt-1 block text-left leading-snug opacity-90">{citation.snippet}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
