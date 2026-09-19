/**
 * Asistan metninde ham LLM kontrol token'ları varsa temizler;
 * kullanıcı ve asistan metinlerini şeffaf şekilde korur.
 */

const SPECIAL_TOKEN = /<\|[^|>]{0,80}\|>/g;

export function stripLeakedControlTokens(text: string): string {
  if (!text) return "";
  if (/^\s+$/.test(text)) return text;
  return text.replace(SPECIAL_TOKEN, "");
}

/**
 * Şeffaf metin geçişi: Metinleri veya düşünceleri sansürlemez,
 * gizlemez ya da silmez. Her şey olduğu gibi şeffaf aktarılır.
 */
export function sanitizeAssistantText(text: string): string {
  return text ?? "";
}
