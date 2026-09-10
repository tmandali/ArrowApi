"use client";

import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import {
  DocumentActivity,
  type ActivityItem,
} from "@/components/common/document-activity";
import { DocumentComments } from "@/components/common/document-comments";
import {
  useRecordCommentsStore,
  type RecordComment,
} from "@/lib/stores/record-comments";
import { formatMetaDate } from "@/utils/format";

const EMPTY_COMMENTS: RecordComment[] = [];

function commentToItem(comment: RecordComment): ActivityItem {
  return {
    id: comment.id,
    type: "comment",
    author: "Siz",
    message: "yorum yaptı",
    time: formatMetaDate(comment.createdAt),
    commentText: comment.text,
  };
}

type DetailTimelineProps = {
  /** Kayıt adı (yorum baş harfleri buradan türetilir) */
  recordName?: string;
  /** Oluşturma/güncelleme epoch-ms (mutlak tarihler — hydration güvenli) */
  createdAt?: number | null;
  updatedAt?: number | null;
  /**
   * Yerleşik kayıt açıklaması (örn. `skills/<ad>/SKILL.md`); verilirse
   * tarih satırları yerine tek paket satırı basılır.
   */
  builtinSource?: string;
  /** Doğrudan aktivite listesi (verilirse otomatik üretim atlanır) */
  items?: ActivityItem[];
  /** Yorum kutusu placeholder'ı */
  commentPlaceholder?: string;
  /** Yorum kutusu baş harfleri (varsayılan: kayıt adından) */
  commentInitials?: string;
  /** Yorum kutusu gösterilsin mi (varsayılan: true) */
  showComments?: boolean;
  /**
   * Kayıt anahtarı (`agent:<id>`, `skill:<id>`…): yorumlar bu anahtarla
   * cihazda saklanır, listeye eklenir, Vazgeç ile silinir. Yoksa yorum
   * kutusu basılmaz (saklanacak yer yok).
   */
  recordKey?: string;
  /** Sayfaya özel iç içerik (ayraç ile yorum kutusu arasına basılır) */
  children?: ReactNode;
};

/**
 * Kayıt alt zaman çizgisi (item detay deseni): ayraç + sayfa içeriği +
 * yorum kutusu + aktivite. Gösterilecek veri yoksa hiçbir şey basılmaz.
 * Ekranlar yalnızca kayıt bilgisini verir, alan içerikleri children ile
 * sayfaya göre farklılaştırılabilir.
 */
export function DetailTimeline({
  recordName,
  createdAt,
  updatedAt,
  builtinSource,
  items,
  commentPlaceholder = "Yanıt / yorum yazın",
  commentInitials,
  showComments = true,
  recordKey,
  children,
}: DetailTimelineProps) {
  const autoItems: ActivityItem[] = (() => {
    if (builtinSource) {
      return [
        {
          id: "builtin",
          author: "Sistem",
          message: "yerleşik paketle birlikte geldi",
          time: builtinSource,
        },
      ];
    }
    if (createdAt == null) return [];
    const built: ActivityItem[] = [
      {
        id: "created",
        author: "Siz",
        message: "bu kaydı oluşturdu",
        time: formatMetaDate(createdAt),
      },
    ];
    if (updatedAt != null && updatedAt !== createdAt) {
      built.unshift({
        id: "updated",
        author: "Siz",
        message: "bu kaydı güncelledi",
        time: formatMetaDate(updatedAt),
      });
    }
    return built;
  })();

  const resolvedItems = items ?? autoItems;
  const canComment = showComments && recordKey != null;
  if (resolvedItems.length === 0 && children == null && !canComment) {
    return null;
  }

  const initials =
    commentInitials ??
    (recordName?.trim().slice(0, 2).toUpperCase() || "KY");

  return (
    <TimelineWithComments
      recordKey={recordKey}
      initials={initials}
      commentPlaceholder={commentPlaceholder}
      canComment={canComment}
      autoItems={resolvedItems}
    >
      {children}
    </TimelineWithComments>
  );
}

/**
 * Store aboneliği iç bileşende tutulur: kayıtsız kullanımda
 * `DetailTimeline` store'a dokunmaz.
 */
function TimelineWithComments({
  recordKey,
  initials,
  commentPlaceholder,
  canComment,
  autoItems,
  children,
}: {
  recordKey?: string;
  initials: string;
  commentPlaceholder: string;
  canComment: boolean;
  autoItems: ActivityItem[];
  children?: ReactNode;
}) {
  const byRecord = useRecordCommentsStore((s) => s.byRecord);
  const addComment = useRecordCommentsStore((s) => s.addComment);
  const removeComment = useRecordCommentsStore((s) => s.removeComment);

  const stored = recordKey ? (byRecord[recordKey] ?? EMPTY_COMMENTS) : EMPTY_COMMENTS;
  const storedItems = [...stored].reverse().map(commentToItem);
  const merged = [...storedItems, ...autoItems];
  const showBox = canComment && recordKey != null;

  if (merged.length === 0 && children == null && !showBox) return null;

  return (
    <>
      <Separator />
      {children}
      {showBox ? (
        <DocumentComments
          placeholder={commentPlaceholder}
          initials={initials}
          onSubmit={(text) => {
            if (recordKey) addComment(recordKey, text);
          }}
        />
      ) : null}
      {merged.length > 0 ? (
        <DocumentActivity
          items={merged}
          onDismissComment={
            recordKey
              ? (id) => removeComment(recordKey, id)
              : undefined
          }
        />
      ) : null}
    </>
  );
}
