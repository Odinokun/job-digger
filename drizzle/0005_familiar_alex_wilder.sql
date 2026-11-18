CREATE TABLE "vacancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"location" text,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_source_id_career_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."career_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vacancies_source_key_idx" ON "vacancies" USING btree ("source_id","key");--> statement-breakpoint
CREATE INDEX "vacancies_detected_idx" ON "vacancies" USING btree ("first_detected_at","id");