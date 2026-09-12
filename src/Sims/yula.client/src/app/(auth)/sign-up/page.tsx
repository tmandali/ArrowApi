"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Globe, KeyRound, Loader2 } from "lucide-react";

export default function SignUpPage() {
  const t = useTranslations("SignUp");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [loading, setLoading] = React.useState<string | null>(null);

  const handleProvider = async (provider: "keycloak" | "google") => {
    setLoading(provider);
    try {
      await signIn(provider, { redirectTo: next });
    } catch {
      setLoading(null);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-lg font-semibold">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          className="w-full"
          type="button"
          onClick={() => void handleProvider("keycloak")}
          disabled={loading !== null}
        >
          {loading === "keycloak" && (
            <Loader2 className="mr-2 size-4 animate-spin" />
          )}
          <KeyRound className="mr-2 size-4" />
          {t("sign_up_keycloak")}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          type="button"
          onClick={() => void handleProvider("google")}
          disabled={loading !== null}
        >
          {loading === "google" && (
            <Loader2 className="mr-2 size-4 animate-spin" />
          )}
          <Globe className="mr-2 size-4" />
          {t("sign_up_google")}
        </Button>

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
