import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * My Settings + System Users için tablo yapıları.
 *
 * - `user_settings`: AI config + dil/saat dilimi + systemFacts.
 *   Ad/e-posta KESİNLİKLE burada YOK — bunlar `app_users`'ta tek kaynak.
 * - `app_users`: Sistem yönetimi; rol, durum, aktiflik + ad/e-posta.
 *   Kimlik modeli: `id` = UYGULAMANIN ürettiği stabil UUID (bir kez
 *   verildikten sonra değişmez). `provider` + `provider_id` = login
 *   kimliği (Keycloak sub / Google sub); upsert eşleşmesi bu çift üzerine
 *   yapılır. Tek provider kimliği = en fazla 1 satır (unique index).
 *
 * NOT: `apiKey` asla bu tablolara yazılmaz (sessionStorage'da kalır).
 * Yeni alan ekleyince: `npm run db:generate` + `npm run db:migrate`.
 */

export const userSettingsSchema = pgTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => appUsersSchema.id),
  language: text("language").default("tr"),
  timeZone: text("time_zone").default("Europe/Istanbul"),
  aiProvider: text("ai_provider"),
  aiModel: text("ai_model"),
  aiEndpoint: text("ai_endpoint"),
  thinkingLevel: text("thinking_level").default("low"),
  systemFacts: jsonb("system_facts").$type<Record<string, string>>().default({}),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const appUsersSchema = pgTable(
  "app_users",
  {
    /** Uygulama GUID'u (crypto.randomUUID) — provider'dan bağımsız, stabil. */
    id: text("id").primaryKey(),
    /** Login provider'ı: `keycloak` | `google` | `local` | null (manuel/admin). */
    provider: text("provider"),
    /** Provider'daki ham sub (Keycloak UUID / Google sayısal). */
    providerId: text("provider_id"),
    name: text("name"),
    email: text("email"),
    role: text("role").default("Viewer"),
    status: text("status").default("Active"),
    lastActive: text("last_active"),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    // Bir provider kimliği en fazla 1 satır (NULL'lar Postgres'te farklı
    // kabul edilir — provider'sız manuel satırlar serbest).
    uniqueIndex("app_users_provider_key").on(table.provider, table.providerId),
  ],
);

export type UserSettingsRow = typeof userSettingsSchema.$inferSelect;
export type AppUserRow = typeof appUsersSchema.$inferSelect;
