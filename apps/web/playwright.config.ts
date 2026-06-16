import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config. Boots the production server with the in-process pglite
 * DB (E2E_PGLITE=1) so the full browser flow runs with NO live Postgres.
 * Run `pnpm build` first, then `pnpm e2e:pw`.
 *
 * NOTE: the overnight build sandbox cannot install the system libs Chromium
 * needs (libxdamage1 et al., no sudo), so the browser spec can't EXECUTE there.
 * The equivalent flow is verified headless-and-browserless by `pnpm e2e:http`
 * (scripts/e2e-http.ts), which drives the same server over raw HTTP. Run the
 * Playwright spec in any environment with browser deps available.
 */
const PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node_modules/.bin/next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: { E2E_PGLITE: "1", NODE_ENV: "production" },
  },
});
