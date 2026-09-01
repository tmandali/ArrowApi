/**
 * Güvenli ve cross-origin / HTTP uyumlu kopyalama yardımcısı.
 * Insecure context (HTTP) üzerinde navigator.clipboard undefined olduğu için
 * otomatik olarak execCommand fallback'ine geçer.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Standart Modern Clipboard API (Yalnızca HTTPS veya localhost üzerinde aktiftir)
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback'e devam et
  }

  // 2. HTTP ve Güvenli Olmayan Origin'ler İçin Güvenli DOM Fallback
  try {
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    }
  } catch {
    return false;
  }

  return false;
}
