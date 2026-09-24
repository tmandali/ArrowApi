/**
 * Next.js Server Lifecycle Hooks - Instrumentation
 * Kurumsal HTTP/HTTPS Proxy ve NO_PROXY desteği için undici EnvHttpProxyAgent yapılandırması.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
      try {
        const { EnvHttpProxyAgent, setGlobalDispatcher } = await import("undici");
        setGlobalDispatcher(new EnvHttpProxyAgent());
        console.log("[Instrumentation] EnvHttpProxyAgent sunucu tarafında başarıyla aktifleştirildi.");
      } catch (error) {
        console.error("[Instrumentation] EnvHttpProxyAgent yüklenirken hata oluştu:", error);
      }
    }
  }
}
