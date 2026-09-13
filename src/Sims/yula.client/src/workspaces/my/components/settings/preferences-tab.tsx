"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { profileInitialsOf } from "./settings-utils";
import type { SettingsFormState } from "./use-settings-form-state";
import type { SystemFactsApi } from "./use-system-facts";
import { ActivityBlock, CommentsBlock, ProfileSidePanel } from "./settings-shared-blocks";

/** Metin-gövdelik bilgi bölümü (şifre/belge/e-posta/workspace/uygulama). */
function InfoSection({
  title,
  body,
  open,
  onOpenChange,
}: {
  title: string;
  body: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border-b pb-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
        <span>{title}</span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground space-y-3">
        <p>{body}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

const INFO_SECTIONS = [
  { key: "pwd", titleKey: "pwd_section_title", bodyKey: "pwd_body" },
  { key: "doc", titleKey: "doc_title", bodyKey: "doc_body" },
  { key: "email", titleKey: "email_title", bodyKey: "email_body" },
  { key: "ws", titleKey: "ws_title", bodyKey: "ws_body" },
  { key: "app", titleKey: "app_title", bodyKey: "app_body" },
] as const;

/** settings sekmesi: system facts + bilgi bölümleri + yorumlar + aktivite + kenar panel. */
export function PreferencesTab({
  form,
  facts,
}: {
  form: SettingsFormState;
  facts: SystemFactsApi;
}) {
  const t = useTranslations("MySettings");
  const [factsOpen, setFactsOpen] = React.useState(false);
  const [thirdPartyOpen, setThirdPartyOpen] = React.useState(true);
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({});

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
      <div className="flex-1 p-6 space-y-6">
        <div className="space-y-3">
          <Collapsible open={factsOpen} onOpenChange={setFactsOpen} className="border-b pb-3">
            <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
              <span>{t("facts_title")}</span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform duration-200 ${
                  factsOpen ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 pl-2 space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("facts_description")}
              </p>

              {Object.keys(facts.systemFacts).length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{t("facts_empty")}</p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(facts.systemFacts)
                    .sort(([a], [b]) => a.localeCompare(b, "tr"))
                    .map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center gap-2 rounded-md border border-muted-foreground/15 bg-muted/20 px-2.5 py-1.5"
                      >
                        <span className="text-xs font-semibold text-foreground">{k}</span>
                        <span className="text-xs text-muted-foreground truncate flex-1">{v}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-red-500"
                          aria-label={t("fact_delete_aria", { key: k })}
                          onClick={() => facts.handleDeleteSystemFact(k)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}

              <div className="flex items-end gap-2 pt-1">
                <div className="w-44">
                  <Input
                    value={facts.factKey}
                    onChange={(e) => facts.setFactKey(e.target.value)}
                    placeholder={t("fact_key_ph")}
                    className="bg-muted/30 border-muted-foreground/20 h-9 text-xs"
                  />
                </div>
                <Input
                  value={facts.factValue}
                  onChange={(e) => facts.setFactValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") facts.handleSaveSystemFact();
                  }}
                  placeholder={t("fact_value_ph")}
                  className="flex-1 bg-muted/30 border-muted-foreground/20 h-9 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={facts.handleSaveSystemFact}
                  disabled={!facts.factKey.trim() || !facts.factValue.trim()}
                  className="h-9 px-3 text-xs gap-1.5"
                >
                  {facts.factSaved ? (
                    <>
                      <Check className="size-3 text-emerald-300" />
                      {t("fact_remembered")}
                    </>
                  ) : (
                    t("fact_remember")
                  )}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {INFO_SECTIONS.map((s) => (
            <InfoSection
              key={s.key}
              title={t(s.titleKey)}
              body={t(s.bodyKey)}
              open={openSections[s.key] ?? false}
              onOpenChange={(open) =>
                setOpenSections((prev) => ({ ...prev, [s.key]: open }))
              }
            />
          ))}

          <Collapsible open={thirdPartyOpen} onOpenChange={setThirdPartyOpen} className="border-b pb-3">
            <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
              <span>{t("tpa_title")}</span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform duration-200 ${
                  thirdPartyOpen ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">{t("social_logins")}</h4>

              <div className="rounded-md border bg-card overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/40 text-xs">
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="w-10 text-center">
                        <Checkbox />
                      </TableHead>
                      <TableHead className="w-12">No.</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead className="w-10 text-center">
                        <Settings className="size-3.5 mx-auto text-muted-foreground" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y text-xs">
                    <TableRow>
                      <TableCell colSpan={6} className="py-3 text-center text-muted-foreground">
                        {t("social_empty")}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
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
