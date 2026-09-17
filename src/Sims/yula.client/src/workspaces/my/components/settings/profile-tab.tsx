"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { profileInitialsOf, splitFullName } from "./settings-utils";
import { ProfileImageCard } from "./profile-image-card";
import type { ProfileLanguage, ProfileTimeZone } from "./settings-types";
import type { SettingsFormState } from "./use-settings-form-state";
import { ActivityBlock, CommentsBlock, ProfileSidePanel } from "./settings-shared-blocks";

/** user-details sekmesi: profil alanları + yorumlar + aktivite + kenar panel. */
export function ProfileTab({ form }: { form: SettingsFormState }) {
  const t = useTranslations("MySettings");
  const [isEnabled, setIsEnabled] = React.useState(true);

  const handleFullNameChange = (value: string) => {
    form.setProfileFullName(value);
    const split = splitFullName(value);
    if (split.first) form.setProfileFirstName(split.first);
    form.setProfileLastName(split.last);
  };

  const handleFirstNameChange = (value: string) => {
    form.setProfileFirstName(value);
    form.setProfileFullName(`${value} ${form.profileLastName}`.trim());
  };

  const handleLastNameChange = (value: string) => {
    form.setProfileLastName(value);
    form.setProfileFullName(`${form.profileFirstName} ${value}`.trim());
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="enabled"
            checked={isEnabled}
            onCheckedChange={(c) => setIsEnabled(!!c)}
          />
          <Label htmlFor="enabled" className="text-xs font-semibold cursor-pointer text-foreground select-none">
            {t("enabled")}
          </Label>
        </div>

        <div className="space-y-4 pt-2">
          <ProfileImageCard />

          <h3 className="text-xs font-semibold text-foreground">{t("basic_info")}</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                {t("field_email")} <span className="text-red-500">*</span>
              </FieldLabel>
              <Input
                value={form.profileEmail}
                onChange={(e) => form.setProfileEmail(e.target.value)}
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs text-muted-foreground">{t("field_full_name")}</FieldLabel>
              <Input
                value={form.profileFullName}
                onChange={(e) => handleFullNameChange(e.target.value)}
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs text-muted-foreground">{t("field_language")}</FieldLabel>
              <Select
                value={form.profileLanguage}
                onValueChange={(val: ProfileLanguage) => form.setProfileLanguage(val)}
              >
                <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                  <SelectValue placeholder={t("field_language")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="english">{t("lang_english")}</SelectItem>
                  <SelectItem value="turkish">{t("lang_turkish")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel className="text-xs text-muted-foreground">
                {t("field_first_name")} <span className="text-red-500">*</span>
              </FieldLabel>
              <Input
                value={form.profileFirstName}
                onChange={(e) => handleFirstNameChange(e.target.value)}
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs text-muted-foreground">{t("field_username")}</FieldLabel>
              <Input
                value={form.profileUsername}
                onChange={(e) => form.setProfileUsername(e.target.value)}
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs text-muted-foreground">{t("field_time_zone")}</FieldLabel>
              <Select
                value={form.profileTimeZone}
                onValueChange={(val: ProfileTimeZone) => form.setProfileTimeZone(val)}
              >
                <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                  <SelectValue placeholder={t("field_time_zone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asia-kolkata">Asia/Kolkata</SelectItem>
                  <SelectItem value="europe-istanbul">Europe/Istanbul</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel className="text-xs text-muted-foreground">{t("field_last_name")}</FieldLabel>
              <Input
                value={form.profileLastName}
                onChange={(e) => handleLastNameChange(e.target.value)}
                className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
              />
            </Field>
          </div>
        </div>

        <Separator className="my-6" />

        <CommentsBlock initials={profileInitialsOf(form.profileFullName)} />

        <Separator className="my-6" />

        <ActivityBlock meta={form.meta} profileLoaded={form.profileLoaded} />
      </div>

      <ProfileSidePanel
        fullName={form.profileFullName}
        email={form.profileEmail}
        meta={form.meta}
      />
    </div>
  );
}