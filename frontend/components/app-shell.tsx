"use client";

import { PanelLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WIDTH_KEY = "chatdoc.sidebarWidth.v1";
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 300;

type AppShellProps = {
  children: React.ReactNode;
  activeDocumentId?: string;
};

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    const value = raw ? Number(raw) : DEFAULT_WIDTH;
    if (!Number.isFinite(value)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
  } catch {
    return DEFAULT_WIDTH;
  }
}

export function AppShell({ children, activeDocumentId }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  const persistWidth = useCallback((next: number) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
    setWidth(clamped);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      // ignore quota errors
    }
  }, []);

  useEffect(() => {
    if (!dragging) return;

    function onMove(event: PointerEvent) {
      const delta = event.clientX - dragStartX.current;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta));
      setWidth(next);
    }

    function onUp(event: PointerEvent) {
      const delta = event.clientX - dragStartX.current;
      persistWidth(dragStartWidth.current + delta);
      setDragging(false);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, persistWidth]);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragStartX.current = event.clientX;
    dragStartWidth.current = width;
    setDragging(true);
  }

  return (
    <div className={cn("flex h-dvh min-w-0 overflow-hidden bg-background", dragging && "cursor-col-resize")}>
      <AppSidebar
        activeDocumentId={activeDocumentId}
        collapsed={collapsed}
        width={width}
        onCollapsedChange={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        onResizeStart={beginResize}
        resizing={dragging}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3 py-2 lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open sidebar"
            onClick={() => setMobileOpen(true)}
          >
            <PanelLeft />
          </Button>
          <span className="text-sm font-medium">ChatDoc</span>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
