ALTER TYPE "public"."career_platform" ADD VALUE 'own_page' BEFORE 'unsupported';--> statement-breakpoint
ALTER TABLE "career_sources" ADD COLUMN "vacancy_link_prefix" text;