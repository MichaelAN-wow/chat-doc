"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-4xl">Something broke</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page hit an unexpected error. You can try it again.
      </p>
      <Button type="button" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
