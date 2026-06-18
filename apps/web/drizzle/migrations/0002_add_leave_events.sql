CREATE TABLE IF NOT EXISTS "leave_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_schedule_id" uuid NOT NULL,
	"result_schedule_id" uuid NOT NULL,
	"intern_index" integer NOT NULL,
	"start_week" integer NOT NULL,
	"leave_weeks" integer NOT NULL,
	"resumed_dept" integer,
	"carry_over" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_source_schedule_id_schedules_id_fk" FOREIGN KEY ("source_schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_result_schedule_id_schedules_id_fk" FOREIGN KEY ("result_schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_events_tenant_idx" ON "leave_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_events_result_idx" ON "leave_events" USING btree ("result_schedule_id");
