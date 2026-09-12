CREATE TABLE "user_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text,
	"provider_id" text,
	"name" text,
	"email" text,
	"language" text,
	"user_id" text,
	"last_active" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_user_id_app_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_key" ON "user_identities" USING btree ("provider","provider_id");--> statement-breakpoint
-- BACKFILL: mevcut app_users kayıtlarına birebir identity aç (her app_user = 1 identity).
-- language: o kullanıcının user_settings.language'sinden (ilk kayıtta
-- Accept-Language'dan doldurulan hücrenin geriye dönük yansıtması).
INSERT INTO "user_identities" ("id","provider","provider_id","name","email","language","user_id","last_active")
SELECT gen_random_uuid()::text, a."provider", a."provider_id", a."name", a."email", s."language", a.id, a."last_active"
FROM "app_users" a
LEFT JOIN "user_settings" s ON s."user_id" = a.id;
--> statement-breakpoint
-- BACKFILL: user_settings satırlarını kendi app_users sahibinin identity'sine bağla.
UPDATE "user_settings" s
SET "user_id" = i.id
FROM "user_identities" i
JOIN "app_users" a ON a.id = i."user_id"
WHERE s."user_id" = a.id;
--> statement-breakpoint
-- BACKFILL: app_users'ı olmayan yetim user_settings satırları (legacy `local`,
-- eski session GUID'leri) için provider'sız identity aç — veri korunur,
-- yeni FK geçersizleşmez. user_id NULL → bu kişiler de guest'tir.
INSERT INTO "user_identities" ("id","provider","provider_id","name","email","language","user_id","last_active")
SELECT s."user_id", NULL, NULL, NULL, NULL, s."language", NULL, NULL
FROM "user_settings" s
WHERE NOT EXISTS (SELECT 1 FROM "user_identities" i WHERE i.id = s."user_id");
--> statement-breakpoint
-- user_settings FK'ı EN SON eklenir: o ana kadar mevcut satırların referansları
-- yeniden yazılmamış olur ve constraint ihlal üretmez.
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_identities_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;
