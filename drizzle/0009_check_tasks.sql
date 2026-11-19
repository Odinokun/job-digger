CREATE TYPE "public"."check_task_priority" AS ENUM('manual', 'background');--> statement-breakpoint
CREATE TYPE "public"."check_task_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "check_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"run_id" uuid,
	"priority" "check_task_priority" DEFAULT 'background' NOT NULL,
	"status" "check_task_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" jsonb,
	"skipped_vacancies" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_tasks" ADD CONSTRAINT "check_tasks_source_id_career_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."career_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_tasks" ADD CONSTRAINT "check_tasks_run_id_check_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."check_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_tasks_queue_idx" ON "check_tasks" USING btree ("priority","created_at") WHERE "check_tasks"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "check_tasks_run_idx" ON "check_tasks" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "check_tasks_source_idx" ON "check_tasks" USING btree ("source_id");