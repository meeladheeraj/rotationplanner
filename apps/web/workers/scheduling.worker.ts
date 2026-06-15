/// <reference lib="webworker" />
/**
 * Scheduling worker — runs @rp/engine generate() off the main thread so the UI
 * stays responsive while computing large rosters.
 */
import { generate, type Config, type GenerateResult } from "@rp/engine";

export interface GenerateRequest {
  type: "generate";
  config: Config;
}

export type WorkerResponse =
  | { type: "result"; result: GenerateResult }
  | { type: "error"; message: string };

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const msg = e.data;
  if (msg?.type !== "generate") return;
  try {
    const result = generate(msg.config);
    const res: WorkerResponse = { type: "result", result };
    (self as DedicatedWorkerGlobalScope).postMessage(res);
  } catch (err) {
    const res: WorkerResponse = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res);
  }
};
