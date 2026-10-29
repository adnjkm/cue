"use client";

import { useEffect } from "react";
import { refreshAiStatus } from "@/lib/ai";
import { maybeStartDemo } from "@/lib/demo";
import { hasStoredData } from "@/components/cue/sample";
import { pendingMaterials, resumeIngest } from "@/lib/materials";
import { startIndexer } from "@/lib/retrieval";

/** Starts the app's background work once per page load: demo mode, storage persistence, resumed ingests, the indexer. */
export function Boot() {
  useEffect(() => {
    const controller = new AbortController();
    void navigator.storage?.persist?.().catch(() => undefined);
    void (async () => {
      if (await maybeStartDemo(hasStoredData)) return;
      const status = await refreshAiStatus();
      for (const id of await pendingMaterials().catch(() => [])) {
        if (controller.signal.aborted) return;
        await resumeIngest(id).catch(() => undefined);
      }
      if (status?.mode === "token-factory" && !controller.signal.aborted) startIndexer(controller.signal);
    })();
    return () => controller.abort();
  }, []);
  return null;
}
