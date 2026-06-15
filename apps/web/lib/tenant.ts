/**
 * Tenant isolation helpers.
 *
 * Route handlers must never touch tenant-owned tables directly. They call
 * requireTenant() to get a TenantCtx (db + tenantId + user) and pass it to the
 * data-access functions in lib/data/*, every one of which filters by tenantId.
 */
import { getDb, type DB } from "@/db";
import { getCurrentUser, type AuthUser } from "@/lib/session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface TenantCtx {
  db: DB;
  tenantId: string;
  user: AuthUser;
}

/** Returns the authenticated user or throws 401. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Authentication required");
  return user;
}

/** Returns a tenant-scoped context or throws 401. */
export async function requireTenant(): Promise<TenantCtx> {
  const user = await requireUser();
  return { db: getDb(), tenantId: user.tenantId, user };
}

/** Throws 403 unless the user has one of the allowed roles. */
export function requireRole(user: AuthUser, ...roles: AuthUser["role"][]): void {
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "Insufficient permissions");
  }
}
