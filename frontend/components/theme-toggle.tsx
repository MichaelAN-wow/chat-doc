"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  variant?: "icon" | "menu";
};

export function ThemeToggle({ className, variant = "icon" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid SSR/client icon/variant mismatches that trip the Next.js issues overlay.
  if (!mounted) {
    if (variant === "menu") {
      return (
        <div className={cn("grid h-8 grid-cols-3 gap-1", className)} aria-hidden>
          <div className="rounded-lg bg-muted/40" />
          <div className="rounded-lg bg-muted/40" />
          <div className="rounded-lg bg-muted/40" />
        </div>
      );
    }
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        aria-label="Color theme"
        disabled
      >
        <Sun className="size-4 opacity-40" />
      </Button>
    );
  }

  if (variant === "menu") {
    return (
      <div className={cn("grid grid-cols-3 gap-1", className)}>
        <Button
          type="button"
          size="sm"
          variant={theme === "light" ? "secondary" : "ghost"}
          className="h-8 gap-1"
          onClick={() => setTheme("light")}
        >
          <Sun className="size-3.5" />
          Light
        </Button>
        <Button
          type="button"
          size="sm"
          variant={theme === "dark" ? "secondary" : "ghost"}
          className="h-8 gap-1"
          onClick={() => setTheme("dark")}
        >
          <Moon className="size-3.5" />
          Dark
        </Button>
        <Button
          type="button"
          size="sm"
          variant={theme === "system" ? "secondary" : "ghost"}
          className="h-8 gap-1"
          onClick={() => setTheme("system")}
        >
          <Monitor className="size-3.5" />
          Auto
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className}
          aria-label="Color theme"
        >
          {resolvedTheme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
