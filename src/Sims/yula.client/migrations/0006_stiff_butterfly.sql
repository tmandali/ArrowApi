CREATE TABLE "user_tenant_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role" text DEFAULT 'Guest' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_tenant_roles" ADD CONSTRAINT "user_tenant_roles_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_roles_user_tenant_key" ON "user_tenant_roles" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "user_tenant_roles_tenant_key" ON "user_tenant_roles" USING btree ("tenant_id");