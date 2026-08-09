# ArrowApi

## Sims Client (React frontend)

Mimari kararlar ve dizin yapısı kuralları için bak: **`src/Sims/sims.client/AGENTS.md`**
(her oturumda mutlaka oku).

Kısa özet:
- **Shell (host)** = root iskelet: routing, layout, sidebar, Yula, global sayfalar.
- **Workspace** = bağımsız iş alanı; kendi içeriği `features/<workspace>/` altında, `pages/` sadece ince wrapper.
- Her workspace kendini `index.ts` + `routes.ts` ile **register eder**; shell route'ları toplar.
- Workspace'e özgü ekranlar `features/<workspace>/`, global ekranlar `features/<feature>/`.
- shadcn `components/ui/*`'a dokunma; `.oxlintrc.json` overrides ile korunur.
- Hook + Provider ayrı dosyalarda (Fast Refresh).
- **Workspace'ler ileride module federation ile ayrışacak** (her biri ayrı React remote'u);
  her değişiklikte workspace sınırlarını koru, cross-workspace import minimal olsun.
