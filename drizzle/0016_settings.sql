CREATE TABLE "settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"auto_check_interval_hours" integer DEFAULT 6 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_auto_check_interval_allowed" CHECK ("settings"."auto_check_interval_hours" in (3, 6, 12, 24))
);
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;