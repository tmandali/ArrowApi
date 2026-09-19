import { redirect } from "next/navigation";

/**
 * `/system/agents` rotası `/my/agents` altına taşınmıştır.
 * Geriye dönük uyumluluk için yönlendirilir.
 */
export default function SystemAgentsPage() {
  redirect("/my/agents");
}
