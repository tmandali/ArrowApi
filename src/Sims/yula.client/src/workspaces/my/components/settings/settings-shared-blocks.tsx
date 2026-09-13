"use client";

import { useLocale, useTranslations } from "next-intl";
import { Copy, Paperclip, Plus, Send, Share2, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Timeline,
  TimelineItem,
  TimelineDot,
  TimelineContent,
  TimelineTitle,
  TimelineTime,
} from "@/components/ui/timeline";
import { formatSettingsDate } from "./settings-utils";
import type { SettingsMeta } from "./settings-types";

/**
 * user-details + settings sekmelerinde birebir tekrar eden bloklar:
 * yorum kutusu, aktivite timeline'ı ve sağ kenar paneli.
 */
export function CommentsBlock({ initials }: { initials: string }) {
  const t = useTranslations("MySettings");

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t("comments")}</h3>

      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="relative flex-1">
          <Input
            placeholder={t("comment_placeholder")}
            className="bg-muted/20 border-muted-foreground/20 h-9 text-xs pr-10"
          />
          <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-muted-foreground hover:text-foreground">
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ActivityBlock({
  meta,
  profileLoaded,
}: {
  meta: SettingsMeta;
  profileLoaded: boolean;
}) {
  const t = useTranslations("MySettings");
  const locale = useLocale();
  const fmtDate = (iso: string | null | undefined) => formatSettingsDate(iso, locale);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("activity")}</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
          <Plus className="size-3.5 mr-1" /> {t("new_email")}
        </Button>
      </div>

      <Timeline>
        {meta?.identityCreatedAt ? (
          <TimelineItem>
            <TimelineDot />
            <TimelineContent>
              <TimelineTitle>
                <span className="font-medium">{t("you")}</span> {t("act_created")} ·{" "}
                <TimelineTime>{fmtDate(meta.identityCreatedAt)}</TimelineTime>
              </TimelineTitle>
            </TimelineContent>
          </TimelineItem>
        ) : null}
        {meta?.settingsUpdatedAt ? (
          <TimelineItem>
            <TimelineDot />
            <TimelineContent>
              <TimelineTitle>
                {t("act_settings_updated")} ·{" "}
                <TimelineTime>{fmtDate(meta.settingsUpdatedAt)}</TimelineTime>
              </TimelineTitle>
            </TimelineContent>
          </TimelineItem>
        ) : null}
        {profileLoaded && (!meta?.identityCreatedAt && !meta?.settingsUpdatedAt) && (
          <TimelineItem>
            <TimelineDot />
            <TimelineContent>
              <TimelineTitle className="text-muted-foreground">{t("activity_empty")}</TimelineTitle>
            </TimelineContent>
          </TimelineItem>
        )}
      </Timeline>
    </div>
  );
}

export function ProfileSidePanel({
  fullName,
  email,
  meta,
}: {
  fullName: string;
  email: string;
  meta: SettingsMeta;
}) {
  const t = useTranslations("MySettings");
  const locale = useLocale();
  const fmtDate = (iso: string | null | undefined) => formatSettingsDate(iso, locale);

  return (
    <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-sm text-foreground">{fullName || "—"}</h4>
          <p className="text-muted-foreground text-xs font-mono">{email || "—"}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-6">
          <Copy className="size-3.5 text-muted-foreground" />
        </Button>
      </div>

      <Separator />

      <div className="space-y-1">
        <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2">
            <UserIcon className="size-3.5" />
            {t("assign")}
          </span>
          <Plus className="size-3.5" />
        </Button>

        <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2">
            <Paperclip className="size-3.5" />
            {t("attachments")}
          </span>
          <Plus className="size-3.5" />
        </Button>

        <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2">
            <Share2 className="size-3.5" />
            {t("share")}
          </span>
          <Plus className="size-3.5" />
        </Button>
      </div>

      <Separator />

      <div className="space-y-3 text-muted-foreground text-[11px]">
        <div>
          <p className="font-medium text-foreground">{t("you")}</p>
          <p>{t("panel_updated")} · {fmtDate(meta?.settingsUpdatedAt)}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">{t("you")}</p>
          <p>{t("panel_created")} · {fmtDate(meta?.identityCreatedAt)}</p>
        </div>
      </div>
    </div>
  );
}
