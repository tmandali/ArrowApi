import { createRemoteJWKSet, jwtVerify } from "jose";
import { normalizePhone } from "@/features/auth/lib/sms-otp";
import { verifySmsOtp } from "@/features/auth/lib/sms-otp-store";

/**
 * Google One Tap (Google Identity Services) — sign-in kartındaki GIS butonu.
 */
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const googleOneTapProvider = {
  id: "google-onesig",
  name: "Google One Tap",
  type: "credentials" as const,
  credentials: {
    id_token: { label: "Google ID Token", type: "string" },
  },
  sign_in: "/sign-in",
  async authorize(credentials: Record<string, unknown>) {
    const idToken = typeof credentials?.id_token === "string" ? credentials.id_token : "";
    const clientId = process.env.AUTH_GOOGLE_ID;
    if (!idToken || !clientId) return null;

    // ID token'ı doğrula: imza (Google JWKS) + issuer + audience + süre.
    let payload: {
      sub?: string;
      name?: string;
      email?: string;
      picture?: string;
      exp?: number;
    };
    try {
      const verified = await jwtVerify(idToken, googleJwks, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: clientId,
      });
      payload = verified.payload;
    } catch (error) {
      console.error("[auth] Google One Tap ID token doğrulama hatası:", error);
      return null;
    }
    if (!payload.sub || !payload.exp) return null;

    const accessToken = idToken;
    const expiresAt = payload.exp * 1000;

    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      image: payload.picture,
      accessToken,
      expiresAt,
      provider: "google-onesig",
    };
  },
};

/**
 * SMS OTP credentials provider'ı — telefon numarası + SMS koduyla giriş.
 */
export const smsOtpProvider = {
  id: "sms-otp",
  name: "SMS OTP",
  type: "credentials" as const,
  credentials: {
    phone: { label: "Telefon", type: "text", placeholder: "5XXXXXXXXX" },
    code: { label: "Kod", type: "text" },
  },
  async authorize(credentials: Record<string, unknown>) {
    const phone = normalizePhone(credentials?.phone);
    const code = typeof credentials?.code === "string" ? credentials.code : "";
    if (!phone || !code) return null;

    const verdict = await verifySmsOtp(phone, code);
    if (!verdict.ok) {
      console.log(`[auth] sms-otp doğrulama başarısız (${verdict.reason})`);
      return null;
    }

    return { id: phone, phone };
  },
};
