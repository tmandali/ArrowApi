import { AppLayout } from "@/components/layout/app-layout";
import { RequireSession, PlaybooksPageView } from "@/workspaces/my";

/**
 * `/my/playbooks` — Prosedürel Hafıza & Playbook (LLM Wiki).
 *
 * Yula AI'ın kurumsal ekran kurallarını, çok adımlı ERP iş akışı tariflerini
 * ve denetim günlüğünü yönetir. Oturum zorunludur.
 */
export default function MyPlaybooksPage() {
  return (
    <AppLayout>
      <RequireSession>
        <PlaybooksPageView />
      </RequireSession>
    </AppLayout>
  );
}
