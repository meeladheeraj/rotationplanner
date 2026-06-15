"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Config, GenerateResult } from "@rp/engine";
import type { GenerateRequest, WorkerResponse } from "@/workers/scheduling.worker";

interface SchedulerState {
  generating: boolean;
  result: GenerateResult | null;
  error: string | null;
}

/** Runs engine generation in a Web Worker, keeping the UI responsive. */
export function useScheduler() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<SchedulerState>({
    generating: false,
    result: null,
    error: null,
  });

  useEffect(() => {
    const worker = new Worker(
      new URL("../../workers/scheduling.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "result") {
        setState({ generating: false, result: msg.result, error: null });
      } else {
        setState({ generating: false, result: null, error: msg.message });
      }
    };
    worker.onerror = (e) => {
      setState((s) => ({ ...s, generating: false, error: e.message || "Worker error" }));
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const generate = useCallback((config: Config) => {
    setState({ generating: true, result: null, error: null });
    const req: GenerateRequest = { type: "generate", config };
    workerRef.current?.postMessage(req);
  }, []);

  return { ...state, generate };
}
