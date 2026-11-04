import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Joel's ChatDoc Demo"
      className="group flex items-center gap-2 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden
        className="relative grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
      >
        <span className="absolute inset-1 rounded-[4px] border border-primary-foreground/50" />
        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary-foreground" />
      </span>
      <span className="font-display text-lg leading-none tracking-tight">ChatDoc</span>
    </Link>
  );
}
