/**
 * GIS (Google Identity Services) ortak script yükleyici + client tipi.
 *
 * `https://accounts.google.com/gsi/client` script'i tüm sayfada TEK defa
 * yüklenir (id'li script etiketi ile idempotent). GoogleOneTapButton
 * (renderButton) ve GoogleOneTapPrompt (otomatik kart) birlikte çalışır:
 * loadGsiScript() varlık kontrolü yaptığı için çift script/çift çağrı
 * oluşmaz; GIS `initialize()` kendi config'ini birleştirir.
 */
export interface GsiCredentialResponse {
  credential?: string;
  select_account?: boolean;
}

export interface GsiIdClient {
  initialize: (config: {
    client_id: string;
    callback: (response: GsiCredentialResponse) => void;
  }) => void;
  renderButton: (container: HTMLElement, config?: Record<string, string>) => void;
  /** Sayfa açılışında otomatik One Tap kartını gösterir (üst/sağ overlay). */
  prompt?: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiIdClient } };
  }
}

const GSI_SCRIPT_ID = "gsi-client-script";

/**
 * Tek `initialize()` garantisi:
 *
 * Google, çoklu initialize çağrısında yalnızca SONUNCUSUNUN callback'ini
 * çalıştırır (konsol uyarısı basar). Bu sayfa hem layout'taki
 * GoogleOneTapPrompt'u hem sign-in'deki GoogleOneTapButton'u monte ettiği
 * için initialize() modül seviyesinde TEK kez yapılır; credential
 * callback'i modüldeki handler setine dağilir. renderButton / prompt
 * çağrıları etkilenmez (aynı instance üzerinden gider).
 */
let gsiInitialized = false;
const credentialHandlers = new Set<(credential: string) => void>();

/**
 * GIS client'ı yükler + ortak initialize() garantisi ile başlatır ve
 * credential callback'ini kaydeder. Aynı sayfada birden çok bileşen
 * çağırabilir; initialize yalnızca ilk çağrıda yapılır.
 */
export function initGsiClient(
  clientId: string,
  onCredential: (credential: string) => void,
): Promise<GsiIdClient | null> {
  credentialHandlers.add(onCredential);
  return loadGsiScript().then((gsi) => {
    if (!gsi) return null;
    if (!gsiInitialized) {
      gsiInitialized = true;
      try {
        gsi.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) {
              for (const h of credentialHandlers) h(response.credential);
            }
          },
        });
      } catch {
        // GIS arızası → UI fallback butonuyla kırılmaz.
      }
    }
    return gsi;
  });
}

export function loadGsiScript(): Promise<GsiIdClient | null> {
  return new Promise((resolve) => {
    const existing = window.google?.accounts?.id;
    if (existing) {
      resolve(existing);
      return;
    }
    const existingScript = document.getElementById(
      GSI_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => resolve(window.google?.accounts?.id ?? null),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.id = GSI_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.addEventListener(
      "load",
      () => resolve(window.google?.accounts?.id ?? null),
      { once: true },
    );
    script.addEventListener("error", () => resolve(null), { once: true });
    document.head.appendChild(script);
  });
}
