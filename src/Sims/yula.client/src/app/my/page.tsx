import { redirect } from "next/navigation";

/**
 * `/my` — kişisel workspace giriş ekranı. Tek ekranı (`/my/settings`)
 * barındırdığı için doğrudan dashboard'a yönlendirir.
 */
export default function MyRootPage() {
  redirect("/my/settings");
}
