ALTER TABLE "user_settings" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_provider_key" ON "app_users" USING btree ("provider","provider_id");--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "full_name";