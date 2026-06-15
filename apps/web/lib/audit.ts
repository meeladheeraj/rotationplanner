/**
 * Audit logging. Every tenant mutation should write an audit_log row — ideally
 * inside the same transaction as the mutation (pass the tx as `db`).
 */
import type { DB } from "@/db";
import { auditLog } from "@/db/schema";

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
}

export async function writeAudit(db: DB, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    tenantId: entry.tenantId,
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
  });
}
