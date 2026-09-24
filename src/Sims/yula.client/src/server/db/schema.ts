import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * My Settings + System Users için tablo yapıları.
 *
 * KATMANLI KİMLİK MODELİ:
 * - `user_identities`: LOGIN KİMLİĞİ (her provider'da otomatik açılır —
 *   ensure-user upsert'i). `id` = UYGULAMANIN ürettiği tek stabil GUID;
 *   `user_settings` buna bağlanır. `language` YALNIZ ilk kayıtta
 *   (Accept-Language) yazılır, sonra asla ezilmez. `user_id` (nullable) =
 *   admin yetkilendirme bağlantısı: NULL → GUEST, dolu → app_users kaydı.
 * - `identity_aliases`: cross-provider birleştirme. Aynı kişi birden çok
 *   provider'dan girerse admin "birleştir" eylemiyle hedef kimliğin login
 *   çiftini ana kimliğe alias'lar (oturum çözümü önce ana satıra, yoksa
 *   alias'a bakar); hedef satır silinir, ayarlar + katalog linki taşınır.
 * - `app_users`: YÖNETİCİ KATALOGU (salt admin tarafından açılır/yürütülür —
 *   login akışı ASLA yazmaz). Yetkilendirme: admin, user_identities'te
 *   `user_id IS NULL` (guest) kayıtları seçip bu tabloya kayıt açar ve
 *   identity'nin `user_id` kolonunu buraya linkler.
 * - `user_settings`: Kişisel tercihler (dil/AI config/systemFacts);
 *   FK → user_identities.id. Ad/e-posta tek kaynak: user_identities.
 *
 * NOT: `apiKey` asla bu tablolara yazılmaz (sessionStorage'da kalır).
 * Yeni alan ekleyince: `npm run db:generate` + `npm run db:migrate`.
 */

export const userSettingsSchema = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => userIdentitiesSchema.id),
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

export const userIdentitiesSchema = pgTable(
  "user_identities",
  {
    /** Uygulama GUID'i (crypto.randomUUID) — user_settings'in tek referansı. */
    id: text("id").primaryKey(),
    /** Login provider'ı: `keycloak` | `google` | null (provider'sız/manual). */
    provider: text("provider"),
    /** Provider'daki ham sub (Keycloak UUID / Google sayısal). */
    providerId: text("provider_id"),
    /** Session profilden (boşsa boştur); ad/e-posta tek kaynak bu tablo. */
    name: text("name"),
    email: text("email"),
    /** İlk kayıtta Accept-Language'dan ("tr"|"en"); SONRA ASLA EZİLMEZ. */
    language: text("language"),
    /** Admin yetkilendirme linki: NULL = GUEST. Yalnızca admin akışı yazar. */
    userId: text("user_id").references(() => appUsersSchema.id),
    lastActive: text("last_active"),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    // Bir provider kimliği en fazla 1 identity satırı (NULL'lar Postgres'te
    // farklı kabul edilir — provider'sız manual/guest satırları serbest).
    uniqueIndex("user_identities_provider_key").on(table.provider, table.providerId),
  ],
);

export type UserSettingsRow = typeof userSettingsSchema.$inferSelect;

/**
 * `identity_aliases` — cross-provider BİRLEŞTİRME tablosu.
 *
 * Aynı kişi hem Keycloak'tan hem Google'dan giriyorsa iki ayrı
 * `user_identities` satırı açılır; admin bunları System Users'ta
 * "birleştir" eylemiyle tek kimliğe toplar:
 * - `ownerId` = BAKALAN (hayatta kalan) ana kimlik
 * - `(provider, provider_id)` = birleştirilen (hedef) kimliğin login çifti
 *   → artık oturum çözümü `ownerId`'e yönlenir.
 *
 * Kural: bir login çifti EN FAZLA 1 alias'a bakar (unique). Hedef
 * kimliğin kendi satırı silinir (ayarlar + katalog linki sahibine
 * taşınır — bkz. `/api/system/identities/merge` transaction'ı).
 */
export const identityAliasesSchema = pgTable(
  "identity_aliases",
  {
    id: text("id").primaryKey(),
    /** Birleştirilen kimliğin oturumları bu ana kimliğe yönlenir. */
    ownerId: text("owner_id").notNull().references(() => userIdentitiesSchema.id),
    /** Hedef kimliğin login provider'ı (null olamaz — provider'sız
        satır birleştirilemez, login çözümüyle eşleşemez). */
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("identity_aliases_provider_key").on(table.provider, table.providerId),
    index("identity_aliases_owner_key").on(table.ownerId),
  ],
);

export type IdentityAliasRow = typeof identityAliasesSchema.$inferSelect;

/**
 * `user_tenant_roles` — Tenant (şirket) bazlı yetki matrisi.
 *
 * Çoklu şirket (multi-tenant) yapısında kullanıcının şirket bazındaki rolü:
 * - `userId`: `app_users.id` referansı.
 * - `tenantId`: Şirket tanımlayıcısı (örn. 'lcw', 'dipen', 'sun-inc').
 * - `role`: Tenant içi rol (örn. 'Admin', 'User', 'Guest', 'Viewer').
 */
export const userTenantRolesSchema = pgTable(
  "user_tenant_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsersSchema.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    role: text("role").notNull().default("Guest"),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_tenant_roles_user_tenant_key").on(table.userId, table.tenantId),
    index("user_tenant_roles_tenant_key").on(table.tenantId),
  ],
);

export type UserTenantRoleRow = typeof userTenantRolesSchema.$inferSelect;
export type AppUserRow = typeof appUsersSchema.$inferSelect;

/**
 * `sms_codes` — SMS OTP doğrulama kodları (sms-otp credentials provider'ı).
 *
 * - `phone` E.164 normalize edilir (örn. +905XXXXXXXXX) ve PRIMARY key'dir:
 *   bir telefon numarası için aynı anda EN FAZLA bir bekleyen kod vardır
 *   (yeni istekte satır yenilenir — eski kod artık geçersizdir).
 * - `codeHash`: kodun SHA-256'ı (`phone:code`) — ham kod DISK'E ASLA
 *   yazılmaz; yalnızca hash saklanır.
 * - `attempts`: kod başına deneme sınırı (5); yeni kod yollandığında
 *   sıfırlanır. `expires_at` dolan kod doğrulama tarafında red'den önce
 *   temizlenir (GC, bkz. features/auth/lib/sms-otp.ts).
 * - `lastSendAt`: ardışık gönderimler arası ~30 sn bekleme için DB
 *   tarafında uygulanır (çok instance'ta da tutarlı kalır).
 *
 * Yeni alan ekleyince: `npm run db:generate` + `npm run db:migrate`.
 */
export const smsCodesSchema = pgTable("sms_codes", {
  /** E.164 telefon numarası (ör. +905XXXXXXXXX) — bekleyen kodun anahtarı. */
  phone: text("phone").primaryKey(),
  /** SHA-256(`<phone>:<code>`) hex'ı — ham kod saklanmaz. */
  codeHash: text("code_hash").notNull(),
  /** Kod geçerlilik sınırı (istek anında now + 5 dk). */
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  /** Bu koda ait doğrulama denemeleri (limit: 5). */
  attempts: integer("attempts").notNull().default(0),
  /** İlk kod üretimi — denetim/log amaçlı. */
  sentAt: timestamp("sent_at", { mode: "date" }).defaultNow().notNull(),
  /** Son kod gönderimi — rate-limit (~30 sn aralık) bu kolon üzerinden. */
  lastSendAt: timestamp("last_send_at", { mode: "date" }).defaultNow().notNull(),
});

export type SmsCodeRow = typeof smsCodesSchema.$inferSelect;

/**
 * `agent_runs` — LLM turn / run summary for session persistence & triage.
 */
export const agentRunsSchema = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    status: text("status").notNull().default("in_progress"),
    totalSteps: integer("total_steps").default(0),
    totalDurationMs: integer("total_duration_ms").default(0),
    totalTokens: integer("total_tokens").default(0),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_runs_conversation_key").on(table.conversationId),
  ],
);

export type AgentRunRow = typeof agentRunsSchema.$inferSelect;

/**
 * `agent_steps` — Individual ReAct Step Frames in the Causal Decision Tree.
 * Each row connects to `parent_step_id` to form an inspectable DAG.
 */
export const agentStepsSchema = pgTable(
  "agent_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => agentRunsSchema.id),
    conversationId: text("conversation_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    parentStepId: text("parent_step_id"),
    status: text("status").notNull().default("running"),
    thought: text("thought"),
    toolName: text("tool_name"),
    toolInput: jsonb("tool_input"),
    toolOutput: jsonb("tool_output"),
    errorMessage: text("error_message"),
    transitionReason: text("transition_reason"),
    durationMs: integer("duration_ms").default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_steps_run_key").on(table.runId),
    index("agent_steps_conversation_key").on(table.conversationId),
    index("agent_steps_parent_key").on(table.parentStepId),
  ],
);

export type AgentStepRow = typeof agentStepsSchema.$inferSelect;
