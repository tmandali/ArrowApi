import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Paperclip, Plus } from "lucide-react";
import { DetailAsidePanel, type DetailMetaRow } from "@/components/layout/detail-aside";
import { fileDotClass, fileKindForName } from "@/components/layout/file-kind";
import type { UserAgentAttachment } from "@/lib/yula-user-agent";
import { AgentImageUpload } from "./agent-image-upload";

export interface AgentEditorAsideProps {
  isRO: boolean;
  avatar: string | null;
  setAvatar: (val: string | null) => void;
  setError: (msg: string | null) => void;
  attachments: UserAgentAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<UserAgentAttachment[]>>;
  handlePickAttachments: (list: FileList | null | undefined) => void;
  metaRows: DetailMetaRow[];
}

export function AgentEditorAside({
  isRO,
  avatar,
  setAvatar,
  setError,
  attachments,
  setAttachments,
  handlePickAttachments,
  metaRows,
}: AgentEditorAsideProps) {
  const t = useTranslations("AgentEditor");
  const attachmentInputRef = React.useRef<HTMLInputElement | null>(null);

  if (isRO) return null;

  return (
    <DetailAsidePanel
      image={
        <AgentImageUpload
          value={avatar}
          onChange={setAvatar}
          onError={setError}
          disabled={isRO}
          className="w-full"
        />
      }
      addControl={
        !isRO ? (
          <>
            <Button
              variant="ghost"
              className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground"
              onClick={() => attachmentInputRef.current?.click()}
            >
              <span className="flex items-center gap-2">
                <Paperclip className="size-3.5" />
                {t("attachments")}
              </span>
              <Plus className="size-3.5" />
            </Button>
            <input
              ref={attachmentInputRef}
              type="file"
              accept=".md,.markdown,.txt,.json"
              multiple
              className="sr-only"
              onChange={(e) => {
                handlePickAttachments(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        ) : undefined
      }
      files={attachments.map((file) => ({
        key: file.name.toLowerCase(),
        name: file.name,
        dotClassName: fileDotClass(fileKindForName(file.name)),
      }))}
      onRemoveFile={
        !isRO
          ? (key) =>
              setAttachments((prev) =>
                prev.filter((p) => p.name.toLowerCase() !== key),
              )
          : undefined
      }
      metaRows={metaRows}
    />
  );
}
