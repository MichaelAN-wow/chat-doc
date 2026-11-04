import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">ChatDoc</p>
      <h1 className="mt-3 font-display text-4xl">That page is not here</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may be old, or the file was removed.
      </p>
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Back to upload
      </Link>
    </main>
  );
}
