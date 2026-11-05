import { Suspense } from "react";

import { Workspace } from "@/components/workspace/workspace";

export default function DocumentPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-muted-foreground">Opening the document…</div>}
    >
      <Workspace />
    </Suspense>
  );
}
