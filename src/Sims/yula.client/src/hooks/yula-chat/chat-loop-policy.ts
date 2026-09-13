import type { YulaMessage } from "@/app/api/agent/chat/route";
import {
  yulaToolPartInfo,
  isFailedToolInfo,
} from "@/lib/yula-tool-info";
import { isApplyNavigateOutput } from "./chat-shared";

/**
 * Manual agent loop bütçesi (cookbook: manual-agent-loop — "Custom Loop Control"):
 * kullanıcı mesajı başına otomatik devam adımı üst sınırı; sonsuz araç döngüsünü
 * keser. Adım = araç içeren bir asistan mesajı (her resubmit yeni mesaj açar);
 * mesaj geçmişinden türetildiği için reload sonrası da doğru sayılır.
 * 4 — model cevabı genelde 1-2 araçta tamamlar; kuyruk turları görünür gecikme
 * ürettiği için bütçe sıkı tutulur.
 */
export const MAX_AUTO_STEPS = 4;

export function toolStepCountSinceLastUser(messages: YulaMessage[]): number {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === "user") break;
    if (
      m.role === "assistant" &&
      m.parts.some((p) => yulaToolPartInfo(p) !== null)
    ) {
      count += 1;
    }
  }
  return count;
}

/** Son kullanıcı mesajının birleşik metin içeriği (niyet kapısı için). */
export function lastUserTextFromMessages(messages: YulaMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  return lastUser.parts
    .map((p) => (p.type === "text" ? ((p as { text?: string }).text ?? "") : ""))
    .join("\n")
    .trim();
}

export function isFinalToolState(state: string): boolean {
  return state === "output-available" || state === "output-error";
}

/**
 * SDK `sendAutomaticallyWhen` sözleşmesi (cookbook: call-tools, human-in-the-loop,
 * call-tools-multiple-steps) — SDK bu fonksiyonu İKİ anda çağırır:
 *   (a) her akış bittiğinde (ai Chat: `shouldSendAutomatically` finally bloğu),
 *   (b) addToolOutput ile çıktı eklendikten sonra.
 * True dönmesi → SDK geçmişi OLDUĞU GİBİ yeniden gönderir (resubmit).
 *
 * Canonical semantik (ai: lastAssistantMessageIsCompleteWithToolCalls):
 * yalnızca SON adım (son `step-start` sonrası) değerlendirilir. Tüm mesajı
 * taramak HATALIDIR: sunucu çok-adımlı yanıtta son cevabı metinle bitirirken
 * önceki adımlarda tamamlanmış araçlar bulunur; tüm-mesaj taraması cevap
 * verildikten sonra da resubmit tetikler → modelin aynı cevabı tekrar tekrar
 * yazmasına yol açar (sonsuz döngü).
 */
export function shouldContinueAfterToolOutputs(
  messages: YulaMessage[],
): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;

  // Canonical: yalnızca son adımın araçlarına bak.
  const lastStepStart = last.parts.reduce(
    (idx, part, index) => (part.type === "step-start" ? index : idx),
    -1,
  );
  const lastStep = last.parts.slice(lastStepStart + 1);
  const toolInfos = lastStep
    .map((p) => yulaToolPartInfo(p))
    .filter((info): info is NonNullable<typeof info> => info !== null);
  if (toolInfos.length === 0) return false;
  if (!toolInfos.every((info) => isFinalToolState(info.state))) return false;

  // Ekran güncelleyen/görselleştiren nihai araçlar YALNIZCA BAŞARILI OLDUĞUNDA durur:
  // Araç hata aldıysa (örn: Binder Error), modelin hata mesajını ve hint'i okuyup
  // kendini düzeltmesi için (Self-Correction Turn) otomatik olarak 2. tur tetiklenir!
  // ask_user_question her durumda terminaldir: cevap yeni kullanıcı mesajıyla gelir.
  // navigate_to_page BİLEREK terminal DEĞİLDİR: sunucu stopWhen akışı bitirir,
  // istemci taze ekran bağlamıyla resubmit eder (araç seti refresh) ve
  // "aç + doldur + çalıştır" zinciri sürer. Yalın navigasyonlar döngüye girmez:
  // resubmit sonrası yeni araç çağrısı yoksa (toolInfos boş) veya model esaslı
  // cevap yazdıysa aşağıdaki kapılar durur; tekrar navigasyon dedupe'a takılır.
  // apply_criteria + navigateTo is NOT terminal either: runPendingTool
  // navigates to the target screen and waits for arrival, so the resubmit
  // goes out with fresh context (confirmation / run continues there).
  const hasSuccessfulTerminalScreenTool = toolInfos.some(
    (i) =>
      [
        "filter_current_grid",
        "set_grid_query",
        "run_job",
        "apply_criteria",
        "open_last_report",
        "visualize_grid_data",
        "ask_user_question",
        "suggest_next_steps",
      ].includes(i.toolName) &&
      (!isFailedToolInfo(i) || i.toolName === "ask_user_question") &&
      // Yönlendirmeli apply: zincir hedef ekranda sürecek, burada durma.
      !(i.toolName === "apply_criteria" && isApplyNavigateOutput(i.output)),
  );
  if (hasSuccessfulTerminalScreenTool) return false;

  // Anti-loop: son araçtan SONRA model detaylı nihai cevabını yazdıysa dur.
  // Giriş cümleleri (örn. "Tarih trendlerini analiz edelim." veya "SQL sorgusu çalıştırıyorum.")
  // kısa intro metinleridir; modelin sonuçları değerlendirmesi için 2. tur devam etmelidir.
  const lastToolIndex = lastStep.reduce(
    (idx, part, index) => (yulaToolPartInfo(part) !== null ? index : idx),
    -1,
  );
  const textAfterTool = lastStep
    .slice(lastToolIndex + 1)
    .map((p) => (p.type === "text" ? (p as { text?: string }).text ?? "" : ""))
    .join("\n")
    .trim();

  // Yalnızca 80 karakterden uzun veya birden fazla satırlı / detaylı açıklama metni varsa nihai cevaptır
  const isSubstantialAnswer =
    textAfterTool.length > 80 || textAfterTool.includes("\n");
  if (isSubstantialAnswer) return false;

  // Bütçe tükendi: model sonuçlarla devam edemez; kullanıcı yeni mesajla sürdürür.
  return toolStepCountSinceLastUser(messages) < MAX_AUTO_STEPS;
}
