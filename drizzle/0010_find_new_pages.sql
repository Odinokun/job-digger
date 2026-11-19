CREATE TYPE "public"."check_task_kind" AS ENUM('check', 'discover');--> statement-breakpoint
ALTER TYPE "public"."discovery_status" ADD VALUE 'possible_page';--> statement-breakpoint
ALTER TABLE "check_tasks" ALTER COLUMN "source_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "check_tasks" ADD COLUMN "kind" "check_task_kind" DEFAULT 'check' NOT NULL;--> statement-breakpoint
ALTER TABLE "check_tasks" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "check_tasks" ADD CONSTRAINT "check_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_tasks_company_idx" ON "check_tasks" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "check_tasks" ADD CONSTRAINT "check_tasks_target_matches_kind" CHECK (("check_tasks"."kind" = 'check' and "check_tasks"."source_id" is not null and "check_tasks"."company_id" is null) or ("check_tasks"."kind" = 'discover' and "check_tasks"."company_id" is not null and "check_tasks"."source_id" is null));