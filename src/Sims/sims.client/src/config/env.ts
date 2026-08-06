/**
 * Typed access to Vite env vars.
 * Define VITE_* keys in .env / .env.example.
 */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  /** When empty, Yula uses @shadcn/helpers/ai-sdk mock transport. */
  aiChatApiUrl: import.meta.env.VITE_AI_CHAT_API_URL ?? "",
  appEnv: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const
