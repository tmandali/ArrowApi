/**
 * NextAuth v5 yapılandırması.
 * Keycloak (OIDC) + Google OAuth — istenildiğinde başka provider'lar da eklenebilir.
 *
 * Kurulum sonrası .env'e şu anahtarları ekleyin:
 *   AUTH_SECRET=                          (openssl rand -base64 32)
 *   AUTH_KEYCLOAK_ID=                     Keycloak Client ID
 *   AUTH_KEYCLOAK_SECRET=                 Keycloak Client Secret
 *   KEYCLOAK_ISSUER=                      https://<realm>/protocol/openid-connect/
 *   AUTH_GOOGLE_ID=                       Google OAuth Client ID (opsiyonel)
 *   AUTH_GOOGLE_SECRET=                   Google OAuth Client Secret (opsiyonel)
 */
import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import Google from "next-auth/providers/google";
import type { Session as NextAuthSession } from "next-auth";

// Session type extension
export interface Session extends NextAuthSession {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    accessToken?: string;
    provider?: string;
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID!,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          }),
        ]
      : []),
  ],
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "unknown";
        (session.user as typeof session.user & { accessToken?: string; provider?: string }).accessToken =
          token.accessToken as string | undefined;
        (session.user as typeof session.user & { accessToken?: string; provider?: string }).provider =
          token.provider as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
    signOut: "/sign-in",
    error: "/sign-in",
  },
});
