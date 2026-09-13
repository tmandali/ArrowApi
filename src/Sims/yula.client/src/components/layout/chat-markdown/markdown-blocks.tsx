import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { cn } from "@/utils/cn";
import { useYulaGridStore } from "@/lib/stores/grid";
import {
  KNOWN_SYSTEM_ACTIONS,
  isPromptSentenceLike,
  isRunConfirmPhrase,
} from "@/lib/yula-actions";
import { parseColonTitleLine, extractFindingFilterPrompt } from "@/lib/finding-actions";
import { buildFindingDrillPrompt } from "@/lib/yula-finding-drill";
import { reportPageForAction } from "./markdown-entities";
import type { ChatMarkdownCallbacks, ChatMarkdownT } from "./markdown-context";

/** 3a — onay/çalıştırma satırı: "✓ Stok Bakiye Raporu: ..." */
export function renderConfirmationLine(
  trimmed: string,
  lIdx: number,
  cb: ChatMarkdownCallbacks,
  t: ChatMarkdownT,
): React.ReactNode {
  const confirmationMatch = trimmed.match(
    /^([✓📊⚡]\s*)?(\*\*)?([A-Za-zÇĞİÖŞÜçğıöşü0-9\s&/()_-]{3,70}?)(?:\s+Report Started|\s+Raporu Başlatıldı|\s+Raporu Hazırlandı)?(\*\*)?\s*:\s*(.*)$/iu,
  );
  if (
    !confirmationMatch ||
    !(
      confirmationMatch[1] ||
      trimmed.includes("Report Started") ||
      trimmed.includes("Raporu Başlatıldı") ||
      trimmed.includes("Raporu Hazırlandı")
    )
  ) {
    return null;
  }
  const iconPrefix = confirmationMatch[1]?.trim() || (cb.isExecutionConfirmation ? "📊" : "");
  const rawTitle = confirmationMatch[3].trim();
  const reportTitle = rawTitle
    .replace(/\s+Report Started$/i, "")
    .replace(/\s+Raporu Başlatıldı$/i, "")
    .replace(/\s+Raporu Hazırlandı$/i, "");
  const messageDesc = confirmationMatch[5]?.trim() || "";

  return (
    <p key={lIdx} className="leading-relaxed text-[12px]">
      {iconPrefix && (
        <span className="mr-1 font-bold text-orange-500 dark:text-orange-400">{iconPrefix}</span>
      )}
      <button
        type="button"
        onClick={() => {
          const navigated = cb.onNavigateReport(reportTitle);
          if (!navigated) cb.onPrompt(`${reportTitle} hazırla`);
        }}
        title={cb.isExecutionConfirmation ? t("open_live_results", { title: reportTitle }) : t("start_process", { title: reportTitle })}
        className="group mr-1 inline-flex cursor-pointer items-center gap-0.5 align-baseline font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 hover:underline"
      >
        <span>{reportTitle}:</span>
        {cb.isExecutionConfirmation && (
          <FileSpreadsheet className="size-3 shrink-0 text-orange-500/80 transition-transform group-hover:translate-x-0.5 dark:text-orange-400/80" />
        )}
      </button>
      {messageDesc && <span className="text-foreground/90">{messageDesc}</span>}
    </p>
  );
}

/** 3b — öneri/bulgu: tıklanan başlık maddeyi prompt olarak yeniden sorar */
export function renderBulletedItem(
  line: string,
  lIdx: string,
  cb: ChatMarkdownCallbacks,
  t: ChatMarkdownT,
): React.ReactNode {
  const parsed = parseColonTitleLine(line);
  if (!parsed) return null;

  const { title: itemTitle, desc: itemDesc } = parsed;
  // Kriter yankısı ("Hareket Tarihi: ...") bulgu değildir — statik satır.
  if (cb.staticTitles?.includes(itemTitle.trim().toLowerCase())) {
    return (
      <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
        <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70">●</span>
        <div className="flex-1 leading-relaxed text-[12px]">
          <span className="mr-1.5 inline align-baseline text-[12px] font-semibold text-foreground">
            {itemTitle}:
          </span>
          <span className="text-foreground/90 line-clamp-2 break-words">{itemDesc}</span>
        </div>
      </div>
    );
  }
  // "Çalıştır" başlığı doğrudan koşar (ekranın Run akışı); delege yoksa
  // eski bulgu/aksiyon çözümüne düşer.
  const isRunTitle = isRunConfirmPhrase(itemTitle);
  const knownAction = KNOWN_SYSTEM_ACTIONS.find((a) => a.pattern.test(itemTitle));
  // Bulgu tıklaması iki kademeli çözülür: önce yapısal filtre çıkarımı
  // (ucuz, deterministik grid filtresi), çıkarılamazsa başlık + açıklamayı
  // taşıyan tıklama-bağlamı (LLM tespit sorgusunu üretir).
  // View pini: analiz farklı bir tablodan üretildiyse ve kullanıcı o zamandan
  // beri view değiştirdiyse, grid filtresi (aktif view'a işler) atlanır ve
  // drill doğrudan kaynak tabloya pinlenir.
  const findingText = `${itemTitle}: ${itemDesc}`;
  const pinnedTable = cb.sourceTable ?? null;
  const liveTable = useYulaGridStore.getState().spec?.tableName ?? null;
  const sameView =
    !pinnedTable ||
    !liveTable ||
    pinnedTable.toLowerCase() === liveTable.toLowerCase();
  const findingClickPrompt = sameView
    ? (extractFindingFilterPrompt({ text: findingText, columns: cb.columns }) ??
      buildFindingDrillPrompt(findingText))
    : buildFindingDrillPrompt(findingText, pinnedTable);

  // Kayıtlı rapor adı: tıklama prompt göndermek yerine rapor ekranını açar.
  const knownPage = knownAction ? reportPageForAction(knownAction) : null;
  const titleClass = cn(
    "mr-1.5 inline border-0 bg-transparent p-0 text-left align-baseline text-[12px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer transition-colors",
  );

  return (
    <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
      <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70 group-hover:text-orange-500 transition-colors">●</span>
      <div className="flex-1 leading-relaxed text-[12px]">
        {knownAction && knownPage && !isRunTitle ? (
          <Link
            href={knownPage}
            title={t("open_report_screen", { title: itemTitle })}
            className={titleClass}
          >
            {itemTitle}:
          </Link>
        ) : (
        <button
          type="button"
          onClick={() => {
            if (isRunTitle && cb.onRunReport?.()) return;
            if (knownAction) {
              if (cb.isExecutionConfirmation) {
                const navigated = cb.onNavigateReport(knownAction.label);
                if (navigated) return;
              }
              cb.onPrompt(knownAction.prompt);
              return;
            }
            cb.onPrompt(findingClickPrompt);
          }}
          title={
            isRunTitle && cb.onRunReport
              ? t("run_report")
              : t("ask_finding", { prompt: findingClickPrompt })
          }
          className={titleClass}
        >
          {itemTitle}:
        </button>
        )}
        <span className="text-foreground/90 line-clamp-2 break-words">{itemDesc}</span>
      </div>
    </div>
  );
}

/** 3c — kolonsuz veya düz öneri maddesi */
export function renderPlainBullet(
  line: string,
  lIdx: string,
  cb?: ChatMarkdownCallbacks,
  t?: ChatMarkdownT,
): React.ReactNode {
  if (cb && t) {
    const titled = renderBulletedItem(line, lIdx, cb, t);
    if (titled) return titled;
  }
  const cleanBulletText = line.trim().replace(/^([-*•●]|\d+\.)\s+/, "").trim();
  if (!cleanBulletText) return null;

  const boldParts = cleanBulletText.split(/(\*\*[^*]+\*\*)/g);
  const hasBold = boldParts.some((bp) => bp.startsWith("**") && bp.endsWith("**"));

  if (hasBold) {
    return (
      <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
        <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70 group-hover:text-orange-500 transition-colors">●</span>
        <p className="flex-1 leading-relaxed text-[12px] text-foreground/90">
          {boldParts.map((bp, bIdx) => {
            if (bp.startsWith("**") && bp.endsWith("**")) {
              const boldText = bp.slice(2, -2).trim();
              const isRunBold = isRunConfirmPhrase(boldText);
              // Kriter yankısı bold'u da statik kalır (tıklama yok).
              const isStaticBold = Boolean(
                cb?.staticTitles?.includes(boldText.toLowerCase()),
              );
              if (cb?.onPrompt && boldText.length > 1 && !isStaticBold) {
                return (
                  <button
                    key={bIdx}
                    type="button"
                    onClick={() => {
                      if (isRunBold && cb.onRunReport?.()) return;
                      cb.onPrompt(boldText);
                    }}
                    title={
                      isRunBold && cb.onRunReport
                        ? t ? t("run_report") : ""
                        : t ? t("run_cmd", { cmd: boldText }) : ""
                    }
                    className="font-semibold text-foreground hover:text-orange-600 dark:hover:text-orange-400 cursor-pointer border-0 bg-transparent p-0 transition-colors inline"
                  >
                    {boldText}
                  </button>
                );
              }
              return (
                <strong key={bIdx} className="font-semibold text-foreground">
                  {boldText}
                </strong>
              );
            }
            return bp;
          })}
        </p>
      </div>
    );
  }

  // Bold yoksa: parantez öncesi başlığı tıklanabilir yap (örn: "En çok satılan ürün (ItemName bazlı Qty)")
  const parenMatch = cleanBulletText.match(/^([^()\n]{2,60})\s*(\(.+\))$/);
  if (parenMatch && cb?.onPrompt) {
    const titleText = parenMatch[1].trim();
    const descText = parenMatch[2].trim();
    return (
      <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
        <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70 group-hover:text-orange-500 transition-colors">●</span>
        <div className="flex-1 leading-relaxed text-[12px]">
          <button
            type="button"
            onClick={() => cb.onPrompt(titleText)}
            title={t ? t("run_cmd", { cmd: titleText }) : ""}
            className="font-semibold text-foreground hover:text-orange-600 dark:hover:text-orange-400 cursor-pointer border-0 bg-transparent p-0 transition-colors inline mr-1"
          >
            {titleText}
          </button>
          <span className="text-foreground/90">{descText}</span>
        </div>
      </div>
    );
  }

  // Standart düz madde: Eğer öneri/aksiyon cümlesiyse tıklanabilir aksiyon düğmesi yap.
  // Run cümlesi önce doğrudan koşmaya çalışır (ekranın Run akışı).
  const isRunBullet = isRunConfirmPhrase(cleanBulletText);
  const isActionLike =
    isPromptSentenceLike(cleanBulletText) ||
    /(?:filtrele|özetle|çıkar|analiz|grafik|hesapla|göster|listele|hazırla|yap|incele|sorgula|çalıştır|calistir|run|execute|başlat)/i.test(cleanBulletText);

  if (isActionLike && cb?.onPrompt) {
    return (
      <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
        <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70 group-hover:text-orange-500 transition-colors">●</span>
          <button
            type="button"
            onClick={() => {
              if (isRunBullet && cb.onRunReport?.()) return;
              cb.onPrompt(cleanBulletText);
            }}
            title={
              isRunBullet && cb.onRunReport
                ? t ? t("run_report") : ""
                : t ? t("run_cmd", { cmd: cleanBulletText }) : ""
            }
            className="flex-1 leading-snug text-[12px] text-left border-0 bg-transparent p-0 text-foreground/90 hover:text-orange-600 dark:hover:text-orange-400 underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer transition-colors line-clamp-2"
          >
          {cleanBulletText}
        </button>
      </div>
    );
  }

  // Düz bilgilendirme maddesi
  return (
    <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
      <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70">●</span>
      <p className="flex-1 leading-relaxed text-[12px] text-foreground/90">
        {cleanBulletText}
      </p>
    </div>
  );
}
