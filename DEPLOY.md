# Deploying RotationPlanner to Vercel

RotationPlanner is a pnpm monorepo. The deployable app is the Next.js project in
`apps/web`, which depends on the workspace package `@rp/engine` (compiled to
`dist/` during the build). Deploy from the **`release`** branch.

## One-time Vercel setup
1. Vercel -> Add New -> Project -> import `meeladheeraj/rotationplanner`.
2. **Root Directory:** `apps/web`.
3. **Framework Preset:** Next.js (auto-detected).
4. Build/install come from `apps/web/vercel.json`:
   - Install: pnpm, workspace-aware (Vercel default).
   - Build: `pnpm --filter @rp/engine build && pnpm build` (engine first, then Next).
5. **Production Branch:** Settings -> Git -> set to `release`.
6. **Environment Variables** (Production + Preview):
   - `DATABASE_URL` - Neon Postgres connection string.
   - `AUTH_SECRET`  - long random string (reuse local value or generate a new one).
   - `APP_URL`      - deployment URL, e.g. `https://rotationplanner.vercel.app`
     (used to build share links). If unknown, deploy once, then set it and redeploy.
7. Deploy.

## Database
Schema is managed by Drizzle migrations in `apps/web/drizzle/migrations`. Apply them
to whatever DB `DATABASE_URL` points at, before/at first deploy (idempotent):

    pnpm -C apps/web db:migrate

Optional demo data:

    pnpm -C apps/web db:seed

## Notes
- Secrets live only in Vercel env vars; `.env.local` is gitignored and never published.
- PDF/Excel export routes run on the Node.js serverless runtime (default) - no extra config.
