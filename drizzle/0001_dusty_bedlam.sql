CREATE TYPE "public"."career_platform" AS ENUM('greenhouse', 'lever', 'ashby', 'workday', 'peopleforce', 'schema_org', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."discovery_status" AS ENUM('not_checked', 'not_found', 'unsupported', 'check_failed');--> statement-breakpoint
CREATE TABLE "career_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"url" text NOT NULL,
	"platform" "career_platform" NOT NULL,
	"is_tracked" boolean DEFAULT true NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"discovery_status" "discovery_status" DEFAULT 'not_checked' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_not_blank" CHECK (length(trim("companies"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "career_sources" ADD CONSTRAINT "career_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "career_sources_company_idx" ON "career_sources" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_user_normalized_url_unique" ON "companies" USING btree ("user_id","normalized_url");--> statement-breakpoint
CREATE INDEX "companies_user_name_idx" ON "companies" USING btree ("user_id","name");