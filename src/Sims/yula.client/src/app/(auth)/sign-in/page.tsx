"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProviderButtons } from "@/features/auth/components/provider-buttons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignInPage() {
  const t = useTranslations("SignIn");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-lg font-semibold">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Tek giriş noktası: ilk girişte hesap otomatik oluşur, ayrı
            sign-up akışı yok (/sign-up buraya redirect eder). */}
        <ProviderButtons labelPrefix="sign_in" t={t} next={next} />
      </CardContent>
    </Card>
  );
}
