/**
 * End-to-end HTTP smoke test — drives the REAL Next.js server over HTTP with no
 * browser, proving the full Phase-3 flow against an in-process pglite DB:
 *
 *   register → create config (NMC preset) → generate (engine) → save (server
 *   re-validates) → publish (immutable) → share (full + per-intern) → open the
 *   public /s/[token] pages COOKIELESS → download the PDF.
 *
 * Run via `pnpm e2e:http` (see package.json), which starts the server with
 * E2E_PGLITE=1 and points BASE_URL at it. Exits non-zero on the first failure.
 */
import {
  generate,
  schedToBlocks,
  getPreset,
  type Config,
} from "@rp/engine";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";

let cookie = ""; // tiny cookie jar (authenticated requests only)
let passed = 0;

function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

function captureCookie(res: Response) {
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0]!; // rp_session=...
}

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  captureCookie(res);
  return res;
}

async function cookieless(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { redirect: "manual" });
}

async function main() {
  console.log(`E2E HTTP flow against ${BASE}`);

  // 1. Register (sets session cookie)
  const email = `e2e-${Date.now()}@example.com`;
  const reg = await authed("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "supersecret123", tenantName: "E2E Org" }),
  });
  ok(reg.status === 201, `register → 201 (got ${reg.status})`);
  ok(cookie.startsWith("rp_session="), "session cookie set");

  // 2. Create config from the NMC preset
  const cfgRes = await authed("/api/configs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ presetId: "nmc-crmi-2021", nInterns: 135 }),
  });
  ok(cfgRes.status === 201, `create config → 201 (got ${cfgRes.status})`);
  const { id: configId } = (await cfgRes.json()) as { id: string };
  ok(typeof configId === "string" && configId.length > 0, "config id returned");

  // 3. Generate a schedule client-side (engine), as the UI does
  const preset = getPreset("nmc-crmi-2021")!;
  const config: Config = {
    n: 135,
    departments: preset.departments.map((d) => ({
      name: d.name,
      weeks: d.weeks,
      minCoverage: d.minCoverage,
    })),
  };
  const result = generate(config);
  ok(result.internSchedules.length === 135, "engine generated 135 intern schedules");
  ok(result.stats.minCount >= 2, `min weekly coverage >= 2 (got ${result.stats.minCount})`);

  const assignments = result.internSchedules.map((is) => ({
    internIndex: is.id,
    internLabel: `Intern ${is.id + 1}`,
    rotation: schedToBlocks(is.schedule).map((b) => ({
      dept: b.dept,
      deptName: config.departments[b.dept]?.name ?? "",
      start: b.start,
      end: b.end,
    })),
  }));

  // 4. Save — server RE-VALIDATES via @rp/engine before persisting
  const saveRes = await authed(`/api/configs/${configId}/schedules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assignments }),
  });
  ok(saveRes.status === 201, `save schedule → 201 (got ${saveRes.status})`);
  const saved = (await saveRes.json()) as { scheduleId: string; version: number };
  ok(saved.version === 1, `persisted as version 1 (got ${saved.version})`);
  const scheduleId = saved.scheduleId;
  ok(typeof scheduleId === "string" && scheduleId.length > 0, "schedule id returned");

  // 5. Publish (draft → immutable)
  const pub = await authed(`/api/schedules/${scheduleId}/publish`, { method: "POST" });
  ok(pub.status === 200, `publish → 200 (got ${pub.status})`);
  const pub2 = await authed(`/api/schedules/${scheduleId}/publish`, { method: "POST" });
  ok(pub2.status === 409, `re-publish rejected → 409 (got ${pub2.status})`);

  // 6. Share — full
  const shareFull = await authed(`/api/schedules/${scheduleId}/share`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "full" }),
  });
  ok(shareFull.status === 201, `create full share link → 201 (got ${shareFull.status})`);
  const { token: fullToken } = (await shareFull.json()) as { token: string };
  ok(typeof fullToken === "string" && fullToken.length > 0, "full share token returned");

  // 7. Open the public page COOKIELESS
  const pubPage = await cookieless(`/s/${fullToken}`);
  const pubHtml = await pubPage.text();
  ok(pubPage.status === 200, `cookieless /s/[token] → 200 (got ${pubPage.status})`);
  ok(/Full roster/.test(pubHtml) && /Intern\s*\d+/.test(pubHtml), "public page shows the full roster");

  // 8. Share — per-intern, open cookieless, expect a single intern
  const sharePer = await authed(`/api/schedules/${scheduleId}/share`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "per_intern", internLabel: "Intern 2" }),
  });
  ok(sharePer.status === 201, `create per-intern share link → 201 (got ${sharePer.status})`);
  const { token: perToken } = (await sharePer.json()) as { token: string };
  const perPage = await cookieless(`/s/${perToken}`);
  const perHtml = await perPage.text();
  ok(perPage.status === 200, `cookieless per-intern page → 200 (got ${perPage.status})`);
  ok(/Personal rotation/.test(perHtml), "per-intern page renders a personal rotation");

  // 9. Unknown token → 404
  const bad = await cookieless(`/s/this-token-does-not-exist`);
  ok(bad.status === 404, `unknown share token → 404 (got ${bad.status})`);

  // 10. PDF export (authenticated)
  const pdf = await authed(`/api/schedules/${scheduleId}/pdf`);
  ok(pdf.status === 200, `pdf export → 200 (got ${pdf.status})`);
  ok(
    (pdf.headers.get("content-type") ?? "").includes("application/pdf"),
    "pdf content-type is application/pdf",
  );
  const head = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString("latin1");
  ok(head.startsWith("%PDF"), `pdf body starts with %PDF (got ${JSON.stringify(head)})`);

  // 11. Cookieless access to a protected API is rejected
  const noauth = await cookieless(`/api/configs`);
  ok(noauth.status === 401 || noauth.status === 403, `protected API without cookie → 401/403 (got ${noauth.status})`);

  console.log(`\nALL ${passed} ASSERTIONS PASSED`);
}

main().catch((err) => {
  console.error(`\nE2E FAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
