"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { ModelState } from "@/lib/models/catalog";
import {
  loadModelSnapshot,
  saveModelState,
  serverModelState,
  subscribeModels,
} from "@/lib/models/storage";

export function useModels() {
  const state = useSyncExternalStore(subscribeModels, loadModelSnapshot, serverModelState);
  const update = useCallback((next: ModelState) => {
    saveModelState(next);
  }, []);
  return { state, update };
}
