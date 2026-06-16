/**
 * Tenant-scoped data access for user-submitted product feedback.
 *
 * Like every file in lib/data/*, all access is scoped to ctx.tenantId. A
 * feedback row also records the submitting user (nullable — kept for context,
 * set null if the user is later removed) and writes an audit_log entry in the
 * same transaction.
 */
import type { DB } from "@/db";
import { feedback, type FeedbackCategory } from "@/db/schema";
import { writeAudit } from "@/lib/audit";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = ["bug", "idea", "other"];
export const MESSAGE_MAX = 2000;

export interface FeedbackDataCtx {
  db: DB;
  tenantId: string;
  userId?: string | null;
}

export interface FeedbackInput {
  category: FeedbackCategory;
  rating: number | null;
  message: string;
}

export class FeedbackValidationError extends Error {}

/** Validates and normalizes raw input into a FeedbackInput, or throws. */
export function parseFeedback(raw: {
  category?: unknown;
  rating?: unknown;
  message?: unknown;
}): FeedbackInput {
  const category = String(raw.category ?? "other") as FeedbackCategory;
  if (!FEEDBACK_CATEGORIES.includes(category)) {
    throw new FeedbackValidationError("Invalid category");
  }

  let rating: number | null = null;
  if (raw.rating !== undefined && raw.rating !== null && raw.rating !== "") {
    const n = Number(raw.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new FeedbackValidationError("Rating must be an integer from 1 to 5");
    }
    rating = n;
  }

  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length < 3) {
    throw new FeedbackValidationError("Please enter a message (at least 3 characters)");
  }
  if (message.length > MESSAGE_MAX) {
    throw new FeedbackValidationError(`Message must be at most ${MESSAGE_MAX} characters`);
  }

  return { category, rating, message };
}

/** Persists a feedback row + an audit entry in one transaction. Returns the id. */
export async function createFeedback(ctx: FeedbackDataCtx, input: FeedbackInput): Promise<string> {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(feedback)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId ?? null,
        category: input.category,
        rating: input.rating,
        message: input.message,
      })
      .returning({ id: feedback.id });
    if (!row) throw new Error("Failed to insert feedback");

    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId ?? null,
      action: "feedback_submitted",
      entityType: "feedback",
      entityId: row.id,
      metadata: { category: input.category, rating: input.rating },
    });

    return row.id;
  });
}
