import * as z from "zod";

/**
 * Sunucu tarafı env doğrulaması (boilerplate `libs/Env.ts` uyarlaması).
 * UI tarafına dokunmaz; sadece API/DB katmanı kullanır.
 * `process.env` doğrudan okunmaz — bu modülden geçilir.
 *
 * Auth değişkenleri (AUTH_SECRET, AUTH_KEYCLOAK_*) NextAuth v5 tarafından
 * otomatik olarak okunur; burada tekrar validasyona tabi tutmayız.
 */

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@127.0.0.1:5432/postgres"),
  NODE_ENV: z.enum(["test", "development", "production"]).default("development"),
  USE_PGLITE: z
    .enum(["true", "false"])
    .optional()
    .default("false"),
});

const parsed = serverSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  USE_PGLITE: process.env.USE_PGLITE,
});

if (!parsed.success) {
  console.error(z.treeifyError(parsed.error));
  throw new Error("Geçersiz server env (DATABASE_URL / NODE_ENV)");
}

export const Env = parsed.data;
