/**
 * Sağlayıcı akış hatalarını (UIMessage stream `error` parçası) kullanıcı
 * dostu Türkçe mesajlara çevirir. Ham metin sağlayıcıya göre değişir
 * (OpenAI / Azure Foundry / Ollama); bilinen desenler eşlenir, bilinmeyen
 * hatalar ham metin olarak (kırpılmış) gösterilir.
 */
const MAX_RAW_LENGTH = 280;

export function describeYulaStreamError(
  raw: string | undefined | null,
): string | undefined {
  const text = (raw ?? "").trim();
  if (!text) return undefined;
  const lower = text.toLowerCase();

  const isOpenRouterKey = lower.includes("sk-or-");

  if (
    lower.includes("incorrect api key") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("401") ||
    lower.includes("unauthorized")
  ) {
    return isOpenRouterKey
      ? "API anahtarı reddedildi (401): OpenRouter anahtarı (sk-or-v1…), OpenAI uyumlu uç noktaya gönderildi. Model ayarlarından sağlayıcı ile anahtarın eşleştiğini kontrol edin."
      : "API anahtarı geçersiz veya reddedildi (401). Model ayarlarındaki API anahtarını ve sağlayıcı seçimini kontrol edin.";
  }
  if (
    lower.includes("insufficient_quota") ||
    lower.includes("quota") ||
    lower.includes("billing")
  ) {
    return "Sağlayıcı hesabında kota veya bakiye bulunamadı. Sağlayıcının faturalandırma/kota ayarlarını kontrol edin.";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many requests")
  ) {
    return "Sağlayıcı hız sınırına (rate limit) takıldı. Kısa bir süre sonra yeniden deneyin.";
  }
  if (
    lower.includes("model_not_found") ||
    lower.includes("no such model") ||
    (lower.includes("model") && lower.includes("does not exist"))
  ) {
    return "Seçilen model sağlayıcıda bulunamadı. Model listesinden geçerli bir model seçin.";
  }
  if (
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return "Sağlayıcıya ulaşılamadı (ağ hatası). Bağlantınızı, uç nokta adresini ve yerel sunucu (Ollama) durumunu kontrol edin.";
  }
  return text.length > MAX_RAW_LENGTH ? `${text.slice(0, MAX_RAW_LENGTH)}…` : text;
}
