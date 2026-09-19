import { redirect } from "next/navigation";

/**
 * `/system/skills` rotası `/my/skills` altına taşınmıştır.
 * Geriye dönük uyumluluk için yönlendirilir.
 */
export default function SystemSkillsPage() {
  redirect("/my/skills");
}
