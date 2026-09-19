import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<{ tab?: string; edit?: string }>;
};

/**
 * `/my/studio` — Yula Stüdyo artık 4 bağımsız ekrana ayrılmıştır:
 * - `/my/skills` (Beceriler & Komutlar)
 * - `/my/agents` (Personalar & Ajanlar)
 * - `/my/plugins` (Kurumsal Eklentiler)
 * - `/my/memory` (Kalıcı Bellek)
 *
 * Geriye dönük uyumluluk için gelen sekmeye göre doğrudan ilgili ekrana yönlendirilir.
 */
export default async function MyStudioPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = sp?.tab;
  const edit = sp?.edit;

  if (tab === "agents") {
    redirect(edit ? `/my/agents?edit=${encodeURIComponent(edit)}` : "/my/agents");
  }
  if (tab === "plugins") {
    redirect("/my/plugins");
  }
  if (tab === "memory") {
    redirect("/my/memory");
  }
  redirect("/my/skills");
}
