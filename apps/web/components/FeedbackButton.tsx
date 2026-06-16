"use client";

import { useState } from "react";

type Category = "bug" | "idea" | "other";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
];

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
      <path
        d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85L12 3.5z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("idea");
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setCategory("idea");
    setRating(0);
    setHover(0);
    setMessage("");
    setError(null);
    setDone(false);
    setBusy(false);
  }

  function close() {
    setOpen(false);
    // delay reset so the closing transition doesn't flash empty state
    setTimeout(reset, 150);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, rating: rating || null, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not submit feedback");
      setDone(true);
      setTimeout(close, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-600 transition hover:border-brand hover:text-brand"
      >
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-900">Thanks for the feedback!</p>
                <p className="text-sm text-slate-500">We read every submission.</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-slate-900">Send feedback</h2>
                    <p className="text-sm text-slate-500">Found a bug or have an idea? Tell us.</p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <div className="mb-4">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Type</span>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                          category === c.value
                            ? "border-brand bg-brand/5 text-brand"
                            : "border-slate-300 text-slate-600 hover:border-slate-400"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Rating <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        onClick={() => setRating(n === rating ? 0 : n)}
                        onMouseEnter={() => setHover(n)}
                        className={`transition ${
                          n <= (hover || rating) ? "text-amber-400" : "text-slate-300"
                        }`}
                      >
                        <StarIcon filled={n <= (hover || rating)} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="fb-msg">
                    Message
                  </label>
                  <textarea
                    id="fb-msg"
                    required
                    rows={4}
                    maxLength={2000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's on your mind?"
                    className="w-full resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                  />
                </div>

                {error && (
                  <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg px-4 py-2.5 font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-fg focus:outline-none focus:ring-4 focus:ring-brand/25 disabled:opacity-50"
                  >
                    {busy ? "Sending…" : "Send feedback"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
