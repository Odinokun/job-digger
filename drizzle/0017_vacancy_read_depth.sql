CREATE TYPE "public"."check_task_read_depth" AS ENUM('first-page', 'full');--> statement-breakpoint
ALTER TABLE "career_sources" ADD COLUMN "last_full_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "check_tasks" ADD COLUMN "read_depth" "check_task_read_depth" DEFAULT 'full' NOT NULL;