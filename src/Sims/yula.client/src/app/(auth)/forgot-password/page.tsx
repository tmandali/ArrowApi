"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const t = useTranslations("ForgotPassword");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-lg font-semibold">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <div className="relative">
            <Mail className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input id="email" type="email" placeholder="name@company.com" className="pl-9" />
          </div>
        </div>
        <Button className="w-full">{t("send_link")}</Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
            {t("back_to_sign_in")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
