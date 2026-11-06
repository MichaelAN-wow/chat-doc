"use client";

import { ChevronDown, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModelConfig } from "@/lib/models/catalog";

export function ModelMenu({
  configs,
  active,
  onSelect,
  onManage,
}: {
  configs: ModelConfig[];
  active: ModelConfig | null;
  onSelect: (id: string) => void;
  onManage: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="max-w-32 min-w-0 sm:max-w-48" aria-label="Choose model">
          <span className="truncate">{active?.name ?? "Model"}</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(16rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>This conversation</DropdownMenuLabel>
        {configs.map((config) => (
          <DropdownMenuItem key={config.id} onClick={() => onSelect(config.id)}>
            <span className="truncate">{config.name}</span>
            {config.id === active?.id ? (
              <span className="ml-auto text-xs text-muted-foreground">Active</span>
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onManage}>
          <Settings2 />
          Manage models
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
