/**
 * Drizzle schema for RotationPlanner — mirrors plan §3 (Data Model).
 *
 * Multi-tenant: every tenant-owned row carries `tenantId`. All access must go
 * through the withTenant() helper (see lib/tenant.ts) — never query these
 * tables without a tenant filter from a request handler.
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Block, ScheduleStats } from "@rp/engine";

// ---------------------------------------------------------------------------
// Tenancy & identity
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("tenants_slug_idx").on(t.slug),
  }),
);

export type UserRole = "owner" | "admin" | "viewer";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Email is globally unique so login (which has no tenant context yet) is unambiguous.
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    tenantIdx: index("users_tenant_idx").on(t.tenantId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // opaque 256-bit token (stored as the cookie value)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

// ---------------------------------------------------------------------------
// Configs & departments
// ---------------------------------------------------------------------------

export const configs = pgTable(
  "configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    totalWeeks: integer("total_weeks").notNull(),
    nInterns: integer("n_interns").notNull(),
    seed: integer("seed"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("configs_tenant_idx").on(t.tenantId),
  }),
);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configId: uuid("config_id")
      .notNull()
      .references(() => configs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    weeks: integer("weeks").notNull(),
    minCoverage: integer("min_coverage").notNull().default(2),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    configIdx: index("departments_config_idx").on(t.configId),
  }),
);

// ---------------------------------------------------------------------------
// Schedules, assignments, edits
// ---------------------------------------------------------------------------

export type ScheduleStatus = "draft" | "published" | "archived";

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    configId: uuid("config_id")
      .notNull()
      .references(() => configs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").$type<ScheduleStatus>().notNull().default("draft"),
    generatedBy: uuid("generated_by").references(() => users.id, { onDelete: "set null" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    engineVersion: text("engine_version").notNull(),
    stats: jsonb("stats").$type<ScheduleStats>().notNull(),
  },
  (t) => ({
    tenantIdx: index("schedules_tenant_idx").on(t.tenantId),
    configVersionIdx: uniqueIndex("schedules_config_version_idx").on(t.configId, t.version),
  }),
);

/** Ordered rotation block as persisted: dept by NAME (stable across config edits) + weeks. */
export interface AssignmentBlock {
  dept: number; // index into the config's ordered departments (matches engine Block.dept)
  deptName: string;
  start: number; // zero-based inclusive start week
  end: number; // zero-based inclusive end week
}

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    internIndex: integer("intern_index").notNull(),
    internLabel: text("intern_label").notNull(),
    rotation: jsonb("rotation").$type<AssignmentBlock[]>().notNull(),
  },
  (t) => ({
    scheduleIdx: index("assignments_schedule_idx").on(t.scheduleId),
  }),
);

export type ManualEditAction = "swap" | "reassign";

export const manualEdits = pgTable(
  "manual_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
    action: text("action").$type<ManualEditAction>().notNull(),
    payload: jsonb("payload").notNull(),
    validationResult: jsonb("validation_result").notNull(),
  },
  (t) => ({
    scheduleIdx: index("manual_edits_schedule_idx").on(t.scheduleId),
  }),
);

// ---------------------------------------------------------------------------
// Share links & audit
// ---------------------------------------------------------------------------

export type ShareScope = "full" | "per_intern";

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    scope: text("scope").$type<ShareScope>().notNull().default("full"),
    // For per_intern scope, optionally pin to a single intern label.
    internLabel: text("intern_label"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("share_links_token_idx").on(t.token),
    scheduleIdx: index("share_links_schedule_idx").on(t.scheduleId),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("audit_log_tenant_idx").on(t.tenantId),
  }),
);

export type FeedbackCategory = "bug" | "idea" | "other";

// User-submitted product feedback. Tenant-scoped; userId is kept for context
// but set null if the user is later removed (feedback is still useful).
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    category: text("category").$type<FeedbackCategory>().notNull().default("other"),
    rating: integer("rating"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("feedback_tenant_idx").on(t.tenantId),
  }),
);

// Intern leave & resume (FEEDBACK #9). Each row records a leave applied to a
// source schedule version, which produced a new (result) schedule version.
export const leaveEvents = pgTable(
  "leave_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceScheduleId: uuid("source_schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    resultScheduleId: uuid("result_schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    internIndex: integer("intern_index").notNull(),
    startWeek: integer("start_week").notNull(),
    leaveWeeks: integer("leave_weeks").notNull(),
    resumedDept: integer("resumed_dept"),
    // Departments the intern could not finish this year — carry to next batch.
    carryOver: jsonb("carry_over").$type<number[]>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("leave_events_tenant_idx").on(t.tenantId),
    resultIdx: index("leave_events_result_idx").on(t.resultScheduleId),
  }),
);

// ---------------------------------------------------------------------------
// Relations (for typed `db.query.*` access)
// ---------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  configs: many(configs),
  schedules: many(schedules),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  tenant: one(tenants, { fields: [feedback.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [feedback.userId], references: [users.id] }),
}));

export const configsRelations = relations(configs, ({ one, many }) => ({
  tenant: one(tenants, { fields: [configs.tenantId], references: [tenants.id] }),
  departments: many(departments),
  schedules: many(schedules),
}));

export const departmentsRelations = relations(departments, ({ one }) => ({
  config: one(configs, { fields: [departments.configId], references: [configs.id] }),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  tenant: one(tenants, { fields: [schedules.tenantId], references: [tenants.id] }),
  config: one(configs, { fields: [schedules.configId], references: [configs.id] }),
  assignments: many(assignments),
  manualEdits: many(manualEdits),
  shareLinks: many(shareLinks),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  schedule: one(schedules, { fields: [assignments.scheduleId], references: [schedules.id] }),
}));

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  schedule: one(schedules, { fields: [shareLinks.scheduleId], references: [schedules.id] }),
}));

// Re-export the engine Block type for callers that map between the two shapes.
export type { Block };
