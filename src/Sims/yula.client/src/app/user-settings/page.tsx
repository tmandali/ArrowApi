import { redirect } from "next/navigation";

/** Legacy `/user-settings` → `/settings` (profil ayarları global sayfada). */
export default function LegacyUserSettingsPage() {
  redirect("/my/settings");
}
