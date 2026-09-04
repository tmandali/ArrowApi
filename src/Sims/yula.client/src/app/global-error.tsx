"use client";

// App-level güven ağı: hydration/JS çökmesi gibi hard hatalarda beyaz ekran
// yerine Türkçe hata ekranı gösterir. global-error root layout'u devralmaz;
// kendi <html>/<body> sarmalayıcısını kurmak ZORUNDADIR. Hydration hataları
// soft reset ile toparlanamayabileceği için yenileme tam reload yapar.
import { CircleAlert, RotateCw } from "lucide-react";

export default function GlobalError(_props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4" aria-hidden />
            <span>Uygulama yüklenemedi</span>
          </div>
          <p className="max-w-md text-center text-xs opacity-70">
            Beklenmeyen bir hata oluştu; sayfa yeniden yüklenemiyor. Ayrıntılar
            için tarayıcı konsoluna bakabilirsiniz.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-accent"
          >
            <RotateCw className="size-3.5" aria-hidden />
            Sayfayı yenile
          </button>
        </div>
      </body>
    </html>
  );
}
