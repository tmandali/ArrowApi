import type { UserAgent } from "@/lib/yula-user-agent";

/**
 * Sağ panel ajan düzenleyici modu: `new` (boş form), `edit` (düzenleme),
 * `view` (salt-okunur görüntüleme — yerleşik ajanlar için ayrıldı).
 */
export type AgentEditorMode = "new" | "edit" | "view";

export interface AgentEditorHandle {
  save: () => void;
  remove: () => void;
}

export interface AgentEditorProps {
  agent: UserAgent | null;
  mode: AgentEditorMode;
  /** Kayıt geçmişi (alt timeline) görünürlüğü — başlık düğmesinden yönetilir */
  showTimeline?: boolean;
  editorRef: { current: AgentEditorHandle | null };
  onSaved: (id: string) => void;
  onDeleted: () => void;
}
