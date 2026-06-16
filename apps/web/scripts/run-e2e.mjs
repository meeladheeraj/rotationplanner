/**
 * Spawns the production Next.js server with the in-process pglite DB
 * (E2E_PGLITE=1), waits for it to accept connections, runs the HTTP e2e flow,
 * then tears the server down. Exit code mirrors the e2e result.
 *
 * Assumes `next build` has already run (CI/local: `pnpm build` first). Usage:
 *   pnpm e2e:http
 */
import { spawn } from "node:child_process";

const PORT = process.env.PORT ?? "3100";
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn("node_modules/.bin/next", ["start", "-p", PORT], {
  env: { ...process.env, E2E_PGLITE: "1", NODE_ENV: "production" },
  stdio: ["ignore", "inherit", "inherit"],
});

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start within ${timeoutMs}ms`);
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      env: { ...process.env, BASE_URL: BASE },
      stdio: "inherit",
    });
    p.on("exit", (code) => resolve(code ?? 1));
  });
}

let exitCode = 1;
try {
  await waitForServer();
  exitCode = await run("node_modules/.bin/tsx", ["scripts/e2e-http.ts"]);
} catch (err) {
  console.error(err);
} finally {
  server.kill("SIGTERM");
}
process.exit(exitCode);
