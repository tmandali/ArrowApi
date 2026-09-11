"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ImageIcon, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { USER_AGENT_AVATAR_MAX_BYTES } from "@/lib/yula-user-agent";
import { cn } from "@/utils/cn";
import { AgentAvatar } from "./agent-avatar";

type AgentImageUploadProps = {
  /** Görsel dataURL'i (boş = görsel yok) */
  value: string | null;
  onChange: (value: string | null) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Dosyayı dataURL olarak okur. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("unreadable"));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("unreadable"));
    };
    reader.readAsDataURL(file);
  });
}

/** Raster görseli en uzun kenarı maxDim olacak şekilde PNG'ye indirir. */
function downscaleRaster(dataUrl: string, maxDim = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("process_failed"));
    img.onload = () => {
      const scale = Math.min(
        1,
        maxDim / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = dataUrl;
  });
}

/**
 * Ajan görseli yükleme kutusu (SVG/foto: tıklama + sürükle-bırak, hover
 * overlay, silme). Yükleme yoksa baş harfli standart avatar yedeği
 * gösterilir. Kontrollüdür; kalıcılık editör/store üzerinden olur.
 */
export function AgentImageUpload({
  value,
  onChange,
  onError,
  disabled = false,
  className,
}: AgentImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const t = useTranslations("AgentImageUpload");

  const applyFile = React.useCallback(
    (file: File | undefined) => {
      if (disabled || !file) return;
      // Sürükle-bırakta MIME boş gelebilir — uzantı yedeğiyle kabul et.
      const looksImage =
        file.type.startsWith("image/") || /\.svg$/i.test(file.name.trim());
      if (!looksImage) {
        onError?.(t("only_image"));
        return;
      }
      if (file.size > USER_AGENT_AVATAR_MAX_BYTES) {
        onError?.(
          t("too_large", { size: Math.round(USER_AGENT_AVATAR_MAX_BYTES / 1024) }),
        );
        return;
      }
      void (async () => {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          const isSvg =
            file.type === "image/svg+xml" || /\.svg$/i.test(file.name.trim());
          // Raster görseller 256px'e indirilir (localStorage kotası için);
          // SVG vektör olduğu için aynen saklanır.
          onChange(isSvg ? dataUrl : await downscaleRaster(dataUrl));
        } catch {
          onError?.(t("unreadable", { name: file.name }));
        }
      })();
    },
    [disabled, onChange, onError, t],
  );

  const clearImage = React.useCallback(() => {
    if (disabled) return;
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [disabled, onChange]);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.svg"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          applyFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <div
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        aria-label={t("image_name")}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(false);
          applyFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group relative aspect-square w-full overflow-hidden rounded-lg border bg-background outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring/40",
          disabled
            ? "opacity-80"
            : isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/40",
        )}
      >
        {value ? (
          <AgentAvatar
            value={value}
            name={t("image_name")}
            className="size-full rounded-lg"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-8 opacity-60" />
            <span className="text-[11px]">{t("svg_upload")}</span>
          </div>
        )}

        {!disabled ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white transition-opacity",
              isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <Upload className="size-5" />
            <span className="text-xs font-medium">
              {value ? t("change_image") : t("upload_image")}
            </span>
            <span className="text-[10px] text-white/80">{t("or_drag")}</span>
          </div>
        ) : null}
      </div>

      {value && !disabled ? (
        <div className="flex items-center justify-end gap-2 px-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation();
              clearImage();
            }}
            title={t("remove_image")}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
