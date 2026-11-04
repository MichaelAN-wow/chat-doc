import type { DocumentStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const COPY: Record<DocumentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export function StatusPill({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "ready" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        status === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
        status === "processing" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        status === "pending" && "border-border bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "ready" && "bg-emerald-500",
          status === "failed" && "bg-destructive",
          status === "processing" && "animate-pulse bg-amber-500",
          status === "pending" && "bg-muted-foreground",
        )}
        aria-hidden
      />
      {COPY[status]}
    </span>
  );
}
