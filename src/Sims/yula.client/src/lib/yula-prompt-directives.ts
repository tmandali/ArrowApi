/**
 * Sistem promptları için çok dilli (multilingual) direktifler ve terimler.
 * Fiiller ve doğal dil ifadeleri doğrudan kod içine gömülmek yerine
 * `messages/tr.json` ve `messages/en.json` sözlüklerinden beslenir.
 */
import trMessages from "@/messages/tr.json";
import enMessages from "@/messages/en.json";

export interface PromptDirectives {
  runVerbs: string;
  relativeDateTerms: string;
}

export function getPromptDirectives(lang: "tr" | "en" = "tr"): PromptDirectives {
  const dict = lang === "en" ? enMessages : trMessages;
  const directives = (dict as unknown as { PromptDirectives?: { run_verbs?: string; relative_date_terms?: string } })
    .PromptDirectives;

  return {
    runVerbs: directives?.run_verbs ?? "run, execute, start",
    relativeDateTerms: directives?.relative_date_terms ?? "today, yesterday, last week, this month",
  };
}

/**
 * Hem TR hem EN lokalizasyonundan derlenmiş çalıştırma fiilleri direktifi.
 */
export function formatLocalizedRunVerbs(): string {
  const tr = getPromptDirectives("tr");
  const en = getPromptDirectives("en");
  return `TR: [${tr.runVerbs}], EN: [${en.runVerbs}]`;
}

/**
 * Hem TR hem EN lokalizasyonundan derlenmiş göreceli tarih terimleri direktifi.
 */
export function formatLocalizedRelativeDateTerms(): string {
  const tr = getPromptDirectives("tr");
  const en = getPromptDirectives("en");
  return `TR: [${tr.relativeDateTerms}], EN: [${en.relativeDateTerms}]`;
}
