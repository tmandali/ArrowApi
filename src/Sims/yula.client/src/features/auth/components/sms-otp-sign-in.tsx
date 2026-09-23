"use client";

/**
 * SMS OTP giriş formu — sign-in kartına ek credentials akışı.
 *
 * 2 adım:
 *  1. Telefon → `POST /api/sms/request` (kod + SMS/console dispatch).
 *  2. Kod → `signIn("sms-otp", { phone, code, redirect: false })` →
 *     NextAuth credentials `authorize`'ı kodu doğrular; başarıda `next`
 *     hedefine router.push, hatada kart içi uyarı.
 *
 * Bileşen `getProviders()` üzerinden provider'ın gerçekten register
 * edilip edilmediğine bakar (`AUTH_SMS_OTP_ENABLED=true`) — env yoksa
 * KENDİNİ çizer, yer kaplamaz (provider-buttons deseniyle uyumlu).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SmsOtpSignInProps {
  /** Hata/label metinleri — SignIn namespace t'si (anahtarlar tr/en). */
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  /** Giriş sonrası yönlendirilecek URL. */
  next?: string | null;
  /**
   * Üst bileşen (ProviderButtons) getProviders()'ı zaten çektiyse
   * gereksiz ikinci bir ağ isteğini önlemek için iletilir.
   */
  isAvailable?: boolean;
}

type Step = "phone" | "code";

interface SendResult {
  ok: boolean;
  reason?: "invalid_phone" | "gap" | "hourly_limit" | "send_failed";
  lastCode?: string;
}

export function SmsOtpSignIn({ t, next = "/", isAvailable }: SmsOtpSignInProps) {
  const router = useRouter();
  const [available, setAvailable] = React.useState<boolean | null>(
    isAvailable !== undefined ? isAvailable : null,
  );
  const [step, setStep] = React.useState<Step>("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Console modunda route'un döndürdüğü lastCode — dev/test'te form
  // altında gösterilir (üretimde route bu alanı dönmez).
  const [devCode, setDevCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isAvailable !== undefined) return;
    getProviders()
      .then((p) => setAvailable(!!p?.["sms-otp"]))
      .catch(() => setAvailable(false));
  }, [isAvailable]);

  if (available === null) return null; // provider listesi yükleniyor — kaplamama
  if (!available) return null; // provider register edilmemiş (env kapalı)

  const handleSend = async () => {
    setError(null);
    setDevCode(null);
    setSending(true);
    let res: SendResult;
    try {
      res = await fetch("/api/sms/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      })
        .then((r) => r.json() as Promise<SendResult>)
        .catch(() => ({ ok: false, reason: "send_failed" as const }));
    } catch {
      res = { ok: false, reason: "send_failed" };
    }
    setSending(false);

    if (!res.ok) {
      switch (res.reason) {
        case "gap":
          setError(t("sms_code_wait"));
          break;
        case "hourly_limit":
          setError(t("sms_code_hourly"));
          break;
        case "send_failed":
          setError(t("sms_send_failed"));
          break;
        default:
          setError(t("sms_phone_invalid"));
      }
      return;
    }

    setDevCode(res.lastCode ?? null);
    setStep("code");
  };

  const handleVerify = async () => {
    setError(null);
    setVerifying(true);
    const result = await signIn("sms-otp", { phone, code, redirect: false });
    setVerifying(false);
    if (result?.error) {
      // "CredentialsSignin" = authorize null döndü (geçersiz/süreli kod).
      setError(t("sms_invalid_code"));
      return;
    }
    router.push(next ?? "/");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted-foreground">{t("sms_title")}</div>

      {step === "phone" ? (
        <div className="flex gap-2">
          <Input
            className="flex-1"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("sms_phone_placeholder")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && phone.trim()) void handleSend();
            }}
            disabled={sending || verifying}
            aria-label={t("sms_phone_label")}
          />
          <Button type="button" onClick={() => void handleSend()} disabled={sending || !phone.trim()}>
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <span>{t("sms_send_code")}</span>
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("sms_phone_label")}: {phone}</span>
            <button
              type="button"
              className="text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
                setDevCode(null);
              }}
            >
              {t("sms_change_phone")}
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("sms_code_placeholder")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.trim()) void handleVerify();
              }}
              disabled={sending || verifying}
              aria-label={t("sms_code_label")}
            />
            <Button
              type="button"
              onClick={() => void handleVerify()}
              disabled={verifying || code.trim().length < 4}
            >
              {verifying ? <Loader2 className="size-4 animate-spin" /> : <span>{t("sms_verify")}</span>}
            </Button>
          </div>
          {devCode ? (
            <p className="text-xs text-amber-600 dark:text-amber-300">
              {t("sms_dev_code", { code: devCode })}
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
