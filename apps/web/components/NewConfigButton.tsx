"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewConfigButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/configs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ presetId: "nmc-crmi-2021", nInterns: 135 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create config");
      router.push(`/configs/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={create}
        disabled={busy}
        className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-fg disabled:opacity-50"
      >
        {busy ? "Creating…" : "New from NMC preset"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
