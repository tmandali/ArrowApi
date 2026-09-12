import * as z from "zod";

/**
 * Boilerplate `validations/CounterValidation.ts` karşılığı.
 * UI'ya dokunmaz; `/api/my/settings` ve `/api/system/users` bu şemalarla doğrulanır.
 * `apiKey` bilerek şemada YOK — sır asla DB'ye gitmez (sessionStorage).
 */

export const SettingsPutValidation = z.object({
  userId: z.string().min(1).max(128).default("local"),
  language: z.string().max(32).optional().nullable(),
  timeZone: z.string().max(64).optional().nullable(),
  aiProvider: z.enum(["azure", "ollama", "openai", "agnes", "google"]).optional().nullable(),
  aiModel: z.string().max(128).optional().nullable(),
  aiEndpoint: z.string().url().max(512).optional().nullable().or(z.literal("")),
  thinkingLevel: z.enum(["off", "low", "medium", "high"]).optional().nullable(),
  systemFacts: z.record(z.string(), z.string()).optional(),
});

export const SystemUserUpsertValidation = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(256).optional().nullable(),
  email: z.string().email().max(256).optional().nullable(),
  role: z.string().max(128).optional().nullable(),
  status: z.enum(["Active", "Inactive"]).optional().nullable(),
  lastActive: z.string().max(64).optional().nullable(),
  /** Login provider'ı: `keycloak` | `google` | `local` | null (manuel). */
  provider: z.string().max(64).optional().nullable(),
  /** Provider'daki ham sub (Keycloak UUID / Google sayısal). */
  providerId: z.string().max(128).optional().nullable(),
});

export type SettingsPutInput = z.infer<typeof SettingsPutValidation>;
export type SystemUserUpsertInput = z.infer<typeof SystemUserUpsertValidation>;

/**
 * Kimlik yetkilendirme: guest (user_id NULL) bir `user_identities` satırını
 * katalog kaydıyla linkle. `identityId` = user_identities.id;
 * role/status boşsa varsayılanlar (Viewer/Active).
 */
export const SystemUserAuthorizeValidation = z.object({
  identityId: z.string().min(1).max(128),
  role: z.string().max(128).optional().nullable(),
  status: z.enum(["Active", "Inactive"]).optional().nullable(),
  name: z.string().max(256).optional().nullable(),
  email: z.string().email().max(256).optional().nullable(),
});

export type SystemUserAuthorizeInput = z.infer<typeof SystemUserAuthorizeValidation>;

/**
 * Cross-provider birleştirme: `targetIdentityId` login kimliği
 * `ownerId` ana kimliğe alias'lanır (hedef satır silinir,
 * ayarlar + katalog linki sahibine taşınır).
 */
export const SystemUserMergeValidation = z.object({
  ownerId: z.string().min(1).max(128),
  targetIdentityId: z.string().min(1).max(128),
});

export type SystemUserMergeInput = z.infer<typeof SystemUserMergeValidation>;
