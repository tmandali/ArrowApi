import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * My Settings + System Users için tablo yapıları.
 *
 * - `user_settings`: AI config + dil/saat dilimi + systemFacts.
 *   Ad/e-posta KESİNLİKLE burada YOK — bunlar `app_users`'ta tek kaynak.
 * - `app_users`: Sistem yönetimi; rol, durum, aktiflik + ad/e-posta.
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

export const appUsersSchema = pgTable("app_users", {
  id: text("id").primaryKey(),
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
});

export type UserSettingsRow = typeof userSettingsSchema.$inferSelect;
export type AppUserRow = typeof appUsersSchema.$inferSelect;
