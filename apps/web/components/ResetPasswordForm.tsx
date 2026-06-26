"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <p>This reset link is missing its token or is invalid.</p>
        <Link href="/forgot-password" className="font-medium text-brand hover:underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords don't match");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not reset password");
      setDone(true);
      setTimeout(() => router.push("/login"), 1600);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Failed");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Password updated.</p>
        <p>You can now log in with your new password. Redirecting…</p>
        <Link href="/login" className="inline-block font-medium text-brand hover:underline">
          Go to log in
        </Link>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">New password</span>
        <input
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            if (err) setErr(null);
          }}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Confirm new password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => {
            setPw2(e.target.value);
            if (err) setErr(null);
          }}
          className={inputClass}
        />
      </label>

      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {err}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-fg focus:outline-none focus:ring-4 focus:ring-brand/25 disabled:opacity-50"
      >
        {busy ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
