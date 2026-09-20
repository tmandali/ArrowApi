# Tauri 2.0 Hybrid Desktop & Web Architecture [TO-BE]

> [!WARNING]
> **Status: TO-BE / Future Roadmap (Currently Inactive)**  
> This capability is currently out of active scope. Do NOT implement, prioritize, or generate code for Tauri desktop integrations unless explicitly requested by the user.

---

## 1. Dual Deployment Model (Target State)

A single unified codebase powers both deployment targets:
1. **Web Mode (`pnpm dev` / `pnpm build`):** Standard Next.js server and browser client (Active Primary).
2. **Desktop Mode (`pnpm tauri:dev` / `pnpm tauri:build`):** Native desktop shell powered by Tauri 2.0 (Rust) (Future).

---

## 2. Environment Isolation (`isTauriEnv`)

Tauri-specific APIs (`@tauri-apps/api`, `invoke`, native windows, etc.) are unavailable in standard web browsers. Therefore:

- All Tauri-dependent calls MUST be protected behind the `isTauriEnv` check.
- Use dynamic imports (`await import(...)`) to prevent bundler errors in browser mode.

```ts
import { isTauriEnv } from "@/lib/tauri-env";

export async function checkDesktopNotifications() {
  if (!isTauriEnv()) {
    return; // Pass silently in browser environment
  }
  const { sendNotification } = await import("@tauri-apps/plugin-notification");
  sendNotification({ title: "Yula", body: "Report completed." });
}
```

---

## 3. Native Auto-Updater

- Update notifications NEVER pollute the web interface with banners or popups.
- Update checks are triggered exclusively via native OS menus (`Check for Updates...`) and handled by native OS dialogs managed in Rust.
