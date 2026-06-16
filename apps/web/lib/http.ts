import { NextResponse } from "next/server";

import { reportError } from "@/lib/observability";
import { HttpError } from "@/lib/tenant";

/** Wraps a route handler, converting thrown HttpError into JSON responses. */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      // Fire-and-forget: capture to Sentry (if configured) + server logs.
      void reportError(err, { kind: "unhandled_route_error" });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "Invalid JSON body");
}
