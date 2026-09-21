"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DetailAside } from "@/components/layout/detail-aside";
import { ItemImageUpload } from "./ItemImageUpload";
import {
  UserPlus,
  Plus,
  Paperclip,
  ShoppingBag,
  Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";

export interface ItemDetailsAsideProps {
  attachments: { id: string; name: string }[];
  setAttachments: React.Dispatch<
    React.SetStateAction<{ id: string; name: string }[]>
  >;
  attachmentInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ItemDetailsAside({
  attachments,
  setAttachments,
  attachmentInputRef,
}: ItemDetailsAsideProps) {
  const t = useTranslations("ItemForm");

  return (
    <aside className="w-full space-y-4 border-t bg-muted/10 p-3 text-xs @[56rem]/item-details:row-span-2 @[56rem]/item-details:border-l @[56rem]/item-details:border-t-0 sm:p-4">
      <DetailAside
        image={<ItemImageUpload />}
        addControl={
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <UserPlus className="size-3.5" />
                {t("f_assigned_to")}
              </span>
              <Plus className="size-3.5" />
            </Button>
            <div>
              <Button
                variant="ghost"
                className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
                onClick={() => attachmentInputRef.current?.click()}
              >
                <span className="flex items-center gap-2">
                  <Paperclip className="size-3.5" />
                  {t("f_attachments")}
                </span>
                <Plus className="size-3.5" />
              </Button>
              <input
                ref={attachmentInputRef}
                type="file"
                className="sr-only"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length === 0) {
                    return;
                  }
                  setAttachments((prev) => [
                    ...prev,
                    ...files.map((file) => ({
                      id: `${file.name}-${file.lastModified}-${file.size}`,
                      name: file.name,
                    })),
                  ]);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        }
        files={attachments.map((file) => ({
          key: file.id,
          name: file.name,
          icon: <ShoppingBag className="size-3.5 shrink-0" />,
        }))}
        onRemoveFile={(key) =>
          setAttachments((prev) => prev.filter((item) => item.id !== key))
        }
      />

      <div className="space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Tag className="size-3.5" />
            {t("f_tags")}
          </span>
          <Plus className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <UserPlus className="size-3.5" />
            {t("f_share")}
          </span>
          <Plus className="size-3.5" />
        </Button>
      </div>

      <Separator />

      <div className="space-y-3 text-muted-foreground text-[11px]">
        <div>
          <p className="font-medium text-foreground">{t("panel_administrator")}</p>
          <p>{t("panel_last_edited")}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">{t("panel_administrator")}</p>
          <p>{t("panel_created")}</p>
        </div>
      </div>
    </aside>
  );
}
