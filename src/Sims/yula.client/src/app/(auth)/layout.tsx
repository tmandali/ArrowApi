/**
 * Auth route group layout — tüm auth sayfaları ortalanmış merkezi kabukta render edilir.
 * AppLayout (sidebar, header, rail) bu gruba girmez.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}
