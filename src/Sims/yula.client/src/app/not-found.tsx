import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";

export default function NotFound() {
  return (
    <AppLayout>
      <section className="flex h-full min-h-0 flex-1 items-center justify-center p-12">
        <div className="space-y-3 text-center">
          <p className="text-6xl font-bold opacity-15">404</p>
          <p className="text-sm opacity-70">Bu ekran bulunamadı.</p>
          <Link
            href="/"
            className="inline-block rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ana sayfaya dön
          </Link>
        </div>
      </section>
    </AppLayout>
  );
}
