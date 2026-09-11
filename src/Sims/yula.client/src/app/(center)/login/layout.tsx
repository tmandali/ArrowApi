/**
 * Ortalanmış auth kabuğu (örnek proje `(center)/layout` uyarlaması).
 * `/login` ve altındaki auth sayfaları bu kabukta ortalanır.
 * Mevcut ekranlara dokunmaz — sadece `(center)` grubu etkilenir.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center">{children}</div>;
}
