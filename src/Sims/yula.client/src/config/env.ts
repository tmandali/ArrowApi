/**
 * Next karşılığı: import.meta.env yerine process.env.NEXT_PUBLIC_*.
 */
export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  appEnv: process.env.NODE_ENV ?? "",
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
} as const
