# epic-volta — Headless React UI-Agent

DOM'a dokunmayan, Event Bus + Component Registry üzerinden çalışan headless agent monorepo'su.

## Paketler

- `packages/agent-core` — `uiEventBus`, `uiRegistry`, `dispatch_component_action`, reliability/observability katmanları.
- `packages/agent-react` — Saf Headless React kancaları (`AgentProvider`, `useAgentChat`, `useAgentComponent`, `useAgentRouter`).
- `packages/agent-yula` — Kurumsal hazır Yula ERP & Copilot UI teması (`YulaAiDock`, `YulaHomeView`, `YulaAppHeader`, `YulaModuleSidebar`).
- `apps/demo-app` — Vite + React demo (`/`, `/reports`, `/dashboard`, `/tests`). `/api/chat`, Vite dev plugin'i (`agnes-ai-chat-endpoint`) ile sunulur.

## Kurulum

```bash
pnpm install
pnpm -r typecheck
pnpm --filter @my-agent/core test
pnpm simulate          # 16 aşamalı deterministik ajan simülasyonu
pnpm dev              # demo-app :3000
pnpm --filter demo-app build
```

## Projenize Entegrasyon

Mevcut bir projeye bu kütüphaneyi entegre etmek ve bileşenleri "Agent-Ready" hale getirmek için:
👉 **[Entegrasyon Rehberi (`docs/INTEGRATION_GUIDE.md`)](./docs/INTEGRATION_GUIDE.md)**

## Ortam

`apps/demo-app/.env` dosyasına `AGNES_API_KEY` ekleyin (anahtar koda gömülmez).
Bkz. `agent.md` (index) + `docs/00-overview.md` … `docs/06-demo-app.md` + `docs/INTEGRATION_GUIDE.md`.

