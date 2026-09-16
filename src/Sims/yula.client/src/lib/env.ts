import * as z from "zod";

/**
 * Server env doğrulaması (boilerplate `libs/Env.ts` uyarlaması).
 * UI tarafına dokunmaz; sadece API/DB katmanı kullanır.
 * `process.env` doğrudan okunmaz — bu modülden geçilir.
 */

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@127.0.0.1:5432/postgres"),
  NODE_ENV: z.enum(["test", "development", "production"]).default("development"),
});

const parsed = serverSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
});

if (!parsed.success) {
  console.error(z.treeifyError(parsed.error));
  throw new Error("Geçersiz server env (DATABASE_URL/NODE_ENV)");
}

export const Env = parsed.data;
