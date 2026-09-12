CREATE TABLE "identity_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_aliases" ADD CONSTRAINT "identity_aliases_owner_id_user_identities_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_aliases_provider_key" ON "identity_aliases" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "identity_aliases_owner_key" ON "identity_aliases" USING btree ("owner_id");