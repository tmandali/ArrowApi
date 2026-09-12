/**
 * Provider sign-in authorization parametreleri.
 *
 * Google, yalnızca `access_type=offline` istenirse token yanıtında
 * `refresh_token` döndürür. Bu parametre client `signIn` çağrısının
 * 3. argümanı (`SignInAuthorizationParams`) üzerinden OAuth
 * authorization URL'ine eklenir ve provider config'te (OAuthUserConfig)
 * tiplenmediği için client tarafında tutulur.
 *
 * Keycloak (OIDC) default olarak refresh_token döndürür; ek param gerekmez.
 */
import type { SignInAuthorizationParams } from "next-auth/react";

export type AppProviderId = "google" | "keycloak";

/**
 * Provider'ın client `signIn` çağrısına geçecek authorization parametreleri.
 * `undefined` → ek parametre yok. Bilinmeyen provider → undefined.
 */
export function providerSignInParams(
  provider: string,
): SignInAuthorizationParams | undefined {
  switch (provider) {
    case "google":
      // Google refresh_token'ı offline access izniyle (ilk consent) döndürür.
      return { access_type: "offline" };
    default:
      return undefined;
  }
}
