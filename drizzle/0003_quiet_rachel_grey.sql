ALTER TABLE "companies" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "normalized_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "career_sources" ADD COLUMN "normalized_url" text;