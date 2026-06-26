"use client";

import { useState } from "react";
import Link from "next/link";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail || !EMAIL_RE.test(mail)) {
      setErr("Enter a valid email address");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: mail }),
      });
    } catch {
      /* stay generic either way */
    }
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          If an account exists for <strong>{email.trim()}</strong>, a password-reset link is on its
          way. The link expires in 1 hour.
        </p>
        <Link href="/login" className="inline-block font-medium text-brand hover:underline">
          ← Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@hospital.org"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (err) setErr(null);
          }}
          aria-invalid={!!err}
          className={`w-full rounded-lg border px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 ${
            err ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-brand focus:ring-brand/15"
          }`}
        />
        {err && <span className="mt-1 block text-sm text-red-600">{err}</span>}
      </label>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-fg focus:outline-none focus:ring-4 focus:ring-brand/25 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
