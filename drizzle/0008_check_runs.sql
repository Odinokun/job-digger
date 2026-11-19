CREATE TABLE "check_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"sources_total" integer DEFAULT 0 NOT NULL,
	"sources_checked" integer DEFAULT 0 NOT NULL,
	"sources_failed" integer DEFAULT 0 NOT NULL,
	"new_vacancies" integer DEFAULT 0 NOT NULL,
	"removed_vacancies" integer DEFAULT 0 NOT NULL,
	"summary_shown_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_runs_one_active_per_user" ON "check_runs" USING btree ("user_id") WHERE "check_runs"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "check_runs_user_started_idx" ON "check_runs" USING btree ("user_id","started_at");