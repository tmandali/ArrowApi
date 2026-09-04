import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";



// Next.js App Router `metadata` exportu bu dosyada ZORUNLUDUR —
// yalnızca Fast Refresh kuralını susturmak için yönlendirme yapılır.
// eslint-disable-next-line react/only-export-components
export const metadata: Metadata = {
  title: "Yula",
  description: "Yula Client — Next.js web uygulaması",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
