"use client";

import Link from "next/link";
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
import { Separator } from "@/components/ui/separator";

export default function SignUpPage() {
  const t = useTranslations("SignUp");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-lg font-semibold">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ProviderButtons labelPrefix="sign_up" t={t} next={next} />

        <Separator />

        <p className="text-center text-xs text-muted-foreground">
          {t("has_account")}{" "}
          <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
            {t("sign_in")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
