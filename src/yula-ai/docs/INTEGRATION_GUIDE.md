# 🚀 Headless React UI-Agent: Mevcut Projeye Entegrasyon Rehberi

Bu rehber, `@my-agent/core` ve `@my-agent/react` kütüphanelerini mevcut bir React projesine (Vite, Next.js, Create React App vb.) sıfırdan ve eksiksiz bir şekilde entegre etmek için izlenecek adımları açıklar.

---

## 📑 İçindekiler
1. [Mimarinin Temel Mantığı](#1-mimarinin-temel-mantığı)
2. [Paket Kurulumları ve Bağımlılıklar](#2-paket-kurulumları-ve-bağımlılıklar)
3. [Kök Düzeyde Agent Sağlayıcısının (`AgentProvider`) Kurulması](#3-kök-düzeyde-agent-sağlayıcısının-agentprovider-kurulması)
4. [Bileşenlerin Mimarisi: "Agent-Ready" Bileşen Standardı](#4-bileşenlerin-mimarisi-agent-ready-bileşen-standardı)
   - [Bileşen Kaydı ve `useAgentComponent`](#bileşen-kaydı-ve-useagentcomponent)
   - [Zod Parametre Doğrulaması (`actionSchemas`)](#zod-parametre-doğrulaması-actionschemas)
   - [Halüsinasyon Kalkanı: Davranış Sözleşmesi (`ActionContract`)](#halüsinasyon-kalkanı-davranış-sözleşmesi-actioncontract)
   - [Bileşen İçi Olay Bildirimi (`uiEventBus`)](#bileşen-içi-olay-bildirimi-uieventbus)
   - [Çok Sayfalı Mimariler: Katmanlı Bileşen Kaydı (Hierarchical Component Stacking)](#çok-sayfalı-mimariler-katmanlı-bileşen-kaydı-hierarchical-component-stacking)
5. [Ekran Yönlendirmesi (`useAgentRouter`)](#5-ekran-yönlendirmesi-useagentrouter)
6. [Backend API Entegrasyonu (`/api/chat`)](#6-backend-api-entegrasyonu-apichat)
7. [⚡ ZORUNLU ADIM: Projeye `pnpm simulate` Eklenmesi](#7-⚡-zorunlu-adim-projeye-pnpm-simulate-eklenmesi)
   - [Neden `pnpm simulate` Zorunludur?](#neden-pnpm-simulate-zorunludur)
   - [`package.json` Yapılandırması](#packagejson-yapılandırması)
   - [Simülasyon Dosyası Şablonu (`agent-simulation.test.ts`)](#simülasyon-dosyası-şablonu-agent-simulationtestts)
   - [CI/CD Entegrasyonu](#cicd-entegrasyonu)

---

## 1. Mimarinin Temel Mantığı

Geleneksel web ajanları DOM üzerindeki CSS seçicileriyle (butonlar, inputlar) etkileşime girer; bu yöntem kırılgan, yavaş ve güvensizdir.

Bu kütüphane **Headless Event-Driven UI** mimarisini benimser:
- **Ajan doğrudan React state'ine veya DOM'a dokunmaz.**
- Ajan, ekranda o an mount edilmiş olan bileşenlerin kayıt defteri (`uiRegistry`) üzerinden yeteneklerini görür.
- Ajan bir aksiyon çalıştırmak istediğinde (`dispatch_component_action`), işlem önce **Zod Preflight Doğrulaması**, **beforeToolCall Güvenlik Kancası** ve **MutationLine Sıralı Kuyruğundan** geçer.
- Eylemler doğrudan React bileşenlerinin dinlediği `uiEventBus` üzerinden tetiklenir.

---

## 2. Paket Kurulumları ve Mimari Seçenekler

Kütüphane 3 bağımsız katmana ayrılmıştır:

| Paket | Rolü / Amacı | Ne Zaman Kurulmalı? |
| :--- | :--- | :--- |
| **`@my-agent/core`** | **Çekirdek Motor** | Her projede zorunlu (Zod Preflight, Event Bus, MutationLine, HITL, Telemetri, OAuth). |
| **`@my-agent/react`** | **Saf Headless Hooks** | **Kendi arayüzünü sıfırdan tasarlamak isteyenler** için (`useAgentChat`, `useAgentComponent`, `useAgentRouter`, `AgentProvider`). Sıfır CSS/stil dayatması. |
| **`@my-agent/yula`** | **Kurumsal Yula Teması** | **Hazır, şık ve kurumsal ERP/Copilot arayüzü isteyenler** için (`YulaAiDock`, `YulaHomeView`, `YulaAppHeader`, `YulaModuleSidebar`). |

```bash
# Seçenek A: Kendi özel arayüzünüzü tasarlayacaksanız (Saf Headless)
pnpm add @my-agent/core @my-agent/react zod ai @ai-sdk/openai

# Seçenek B: Hazır Yula Copilot & Dock arayüzünü tek satırda kullanacaksanız
pnpm add @my-agent/core @my-agent/react @my-agent/yula zod ai @ai-sdk/openai
```

---

## 3. Kök Düzeyde Agent Sağlayıcısının (`AgentProvider`) Kurulması

Uygulamanızın giriş noktasında (`main.tsx` veya `App.tsx`), tüm uygulamayı `<AgentProvider>` ile sarmalayın:

### 🌟 Seçenek 1: `@my-agent/yula` ile Hazır Yula AI Dock Kullanımı (Önerilen)
```tsx
// src/App.tsx
import React, { useState } from 'react';
import { AgentProvider } from '@my-agent/react';
import { YulaAiDock, YulaAppHeader } from '@my-agent/yula';
import { MyMainLayout } from './components/MyMainLayout';

export function App() {
  const [dockOpen, setDockOpen] = useState(false);

  return (
    <AgentProvider apiEndpoint="/api/chat" systemName="SalesAgent">
      <YulaAppHeader
        dockOpen={dockOpen}
        onToggleDock={() => setDockOpen(prev => !prev)}
      />
      
      <div style={{ display: 'flex', flex: 1 }}>
        <MyMainLayout />

        {/* Sayfadan ayrılmadan sağdan kayan Yula AI Dock */}
        {dockOpen && (
          <YulaAiDock
            currentRoute="/reports"
            onClose={() => setDockOpen(false)}
          />
        )}
      </div>
    </AgentProvider>
  );
}
```

### 🎨 Seçenek 2: Kendi Özel Arayüzünüzü Tasarlama (`useAgentChat` Headless)
```tsx
import React from 'react';
import { AgentProvider, useAgentChat } from '@my-agent/react';

function CustomChatPanel() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useAgentChat('/reports');

  return (
    <form onSubmit={handleSubmit}>
      {messages.map(m => <div key={m.id}>{m.role}: {m.content}</div>)}
      <input value={input} onChange={handleInputChange} placeholder="Ajanla konuş..." />
      <button type="submit" disabled={isLoading}>Gönder</button>
    </form>
  );
}
```

---

## 4. Bileşenlerin Mimarisi: "Agent-Ready" Bileşen Standardı

Hedef projedeki bir bileşenin ajan tarafından hatasız kontrol edilebilmesi için **temel kurala** uyması gerekir:
1. **`id` ve `capabilities` Tanımı:** Bileşenin benzersiz bir kimliği olmalıdır (belirtilmezse `capabilities` otomatik olarak `actions` anahtarlarından türetilir).
2. **Davranış ve Zod Sözleşmesi (`actions`):** Her eylem için `schema`, `whenToCall` (ne zaman çağrılmalı) ve `whenNotToCall` (ne zaman ASLA çağrılmamalı) tanımlanır. Ajanın gönderdiği veriler preflight aşamasında denetlenir; hatalıysa ajan otomatik olarak kendini onarır (`Self-Healing`).

### Örnek 1: Filtre Formu Bileşeni (`CriteriaForm.tsx`)

```tsx
import React, { useState } from 'react';
import { z } from 'zod';
import { useAgentComponent } from '@my-agent/react';

// 1. Zod ile parametre sözleşmelerini tanımlayın
const SetFieldsSchema = z.object({
  storeId: z.string().min(1, 'Mağaza kodu boş olamaz'),
  dateRange: z.string().regex(/^\d{4}-\d{2}$/, 'Tarih formatı YYYY-MM olmalıdır (örn: 2026-09)'),
});

export const CriteriaForm: React.FC = () => {
  const [storeId, setStoreId] = useState('');
  const [dateRange, setDateRange] = useState('');

  // 2. useAgentComponent ile ajana bildirin
  useAgentComponent({
    id: 'filter_form',
    actions: {
      SET_FIELDS: {
        schema: SetFieldsSchema,
        whenToCall: 'Kullanıcı mağaza veya dönem filtresi girmek istediğinde çağrılır.',
        whenNotToCall: 'Alanlar zaten doğru doldurulmuşsa tekrar tekrar çağrılmamalıdır.',
      },
      SUBMIT: {
        schema: z.object({}),
        whenToCall: 'Tüm filtreler eksiksiz girildikten sonra raporu çalıştırmak için çağrılır.',
        whenNotToCall: 'Mağaza kodu veya tarih henüz boşken ASLA çağrılmamalıdır.',
      },
    },
    // 3. Ajan eylem gönderdiğinde ne yapılacağını tanımlayın
    onAction: (action, payload) => {
      if (action === 'SET_FIELDS') {
        if (payload.storeId) setStoreId(payload.storeId);
        if (payload.dateRange) setDateRange(payload.dateRange);
        return { success: true, message: 'Filtreler güncellendi' };
      }
      if (action === 'SUBMIT') {
        handleRunReport();
        return { success: true, message: 'Rapor çalıştırıldı' };
      }
      return { success: false, error: 'Bilinmeyen aksiyon' };
    },
  });

  const handleRunReport = () => {
    // Raporu çalıştırma lojiği...
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleRunReport(); }}>
      <input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="Mağaza" />
      <input value={dateRange} onChange={(e) => setDateRange(e.target.value)} placeholder="Dönem (YYYY-MM)" />
      <button type="submit">Raporu Getir</button>
    </form>
  );
};
```

### Örnek 2: Dinamik Tablo Bileşeni (`ResultGrid.tsx`)

```tsx
import React, { useState } from 'react';
import { z } from 'zod';
import { useAgentComponent } from '@my-agent/react';

export const ResultGrid: React.FC<{ data: any[] }> = ({ data }) => {
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useAgentComponent({
    id: 'result_table',
    actions: {
      SORT: {
        schema: z.object({ direction: z.enum(['asc', 'desc']) }),
        whenToCall: 'Kullanıcı verileri artan veya azalan sırada görmek istediğinde çağrılır.',
        whenNotToCall: 'Tablo henüz boşken veya veri yüklenirken çağrılmamalıdır.',
      },
      EXPORT_CSV: {
        schema: z.object({}),
        whenToCall: 'Kullanıcı Excel veya CSV formatında indirme istediğinde çağrılır.',
        whenNotToCall: 'Veri yokken çağrılmamalıdır.',
      },
    },
    onAction: (action, payload) => {
      if (action === 'SORT') {
        setSortDirection(payload.direction);
        return { success: true, message: `Tablo ${payload.direction} sıralandı.` };
      }
      if (action === 'EXPORT_CSV') {
        triggerCsvDownload();
        return { success: true, message: 'CSV dışa aktarımı başlatıldı.' };
      }
      return { success: false };
    },
  });

  const triggerCsvDownload = () => { /* CSV indirme lojiği */ };

  return (
    <div>
      {/* Tablo Render */}
    </div>
  );
};
```

### Çok Sayfalı Mimariler: Katmanlı Bileşen Kaydı (Hierarchical Component Stacking)

Büyük ve çok sayfalı SPA veya Next.js projelerinde kullanıcı belirli bir ekranda değilken de (örneğin ana sayfadayken) ajandan `"Satış raporunu çalıştır"` veya `"Stok dengesini göster"` gibi komutlar isteyebilir.

Eğer form bileşeni yalnızca kendi sayfası mount edildiğinde kaydedilirse, ana sayfadayken yapılan çağrı Preflight aşamasında *"Bileşen şu an ekranda mount edilmemiş veya görünür değil"* hatasıyla reddedilir.

`@my-agent/core`, bu sorunu çözmek için **LIFO Stack (Katmanlı/Yığın) Kayıt** mimarisini destekler:

1. **Kök (Root Shell) Düzeyinde Headless Fallback:**
   Uygulamanın kök seviyesinde (`AgentProvider` veya global chat kabuğu), sistemde kayıtlı formlar için hafif bir headless dinleyici kaydedebilirsiniz. Ajan dışarıdan bir eylem tetiklediğinde, bu dinleyici otomatik olarak ilgili sayfaya yönlendirir (`router.push('/stock/retail-sales-report')`) veya işlemi arka planda yürütür.
2. **Sayfa Düzeyinde Aktif DOM Eşleşmesi:**
   Kullanıcı ilgili sayfaya girdiğinde, sayfanın `useAgentComponent` kancası aynı `id` ile yığının (stack) en üstüne yerleşir. Eylemler artık doğrudan ekrandaki form bileşeninin state'ine (`useState`, `useForm`) iletilir.
3. **Sayfadan Ayrılma (Unmount) Güvencesi:**
   Kullanıcı sayfadan çıktığında sayfa bileşeni unmount olur ve unregister çağrılır. Ancak yığındaki en üst katman çıkarıldığı için alttaki kök seviye headless dinleyici **silinmez**, otomatik olarak yeniden aktif hale gelir.

```tsx
// Örnek: Kök seviyede headless fallback kaydı
useEffect(() => {
  const unsubs = REGISTERED_REPORTS.map((report) => {
    const componentId = `criteria_form:${report.scope}`;
    // Registry'e genel yetenekleri kaydet
    uiRegistry.register({
      id: componentId,
      capabilities: ['RUN', 'APPLY'],
      meta: { title: report.title, headless: true },
    });

    // Sayfa dışındayken eylem gelirse sayfaya yönlendir
    const unsub = uiEventBus.subscribe(componentId, async (action) => {
      router.push(report.pagePath);
      return { success: true, navigated: true, page: report.pagePath };
    });

    return () => {
      unsub();
      uiRegistry.unregister(componentId);
    };
  });

  return () => unsubs.forEach(fn => fn());
}, []);
```

---

## 5. Ekran Yönlendirmesi (`useAgentRouter`)

Ajanın kontrolsüzce sayfa değiştirmesini önlemek için yönlendirmeyi `useAgentRouter` kancası ile sisteme bağlayın:

```tsx
import { useAgentRouter } from '@my-agent/react';
import { useNavigate, useLocation } from 'react-router-dom'; // veya Next.js router

export function NavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useAgentRouter({
    currentRoute: location.pathname,
    onNavigate: (path) => navigate(path),
    onBack: () => navigate(-1),
  });

  return null;
}
```

---

## 6. Backend API Entegrasyonu (`/api/chat`)

Ajanın model ile iletişim kurduğu API uç noktası, Vercel AI SDK ve kütüphanenin `createAgentToolsForServer` aracı kullanılarak yapılandırılır:

```ts
// api/chat.ts (Next.js App Router veya Vite API Route)
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createAgentToolsForServer } from '@my-agent/core';

export async function POST(req: Request) {
  const { messages, ui_context } = await req.json();

  // DRY Araç Seti: İstemciden gelen aktif bileşen listesiyle
  // otomatik preflight ve Zod şema doğrulaması yapan araçları üretir
  const tools = createAgentToolsForServer(ui_context);

  const result = streamText({
    model: openai('gpt-4o-mini'), // veya agnes-3.0-flash
    system: 'Sen headless UI kontrol eden otonom bir asistansın...',
    messages,
    tools,
  });

  return result.toDataStreamResponse();
}
```

---

## 7. ⚡ ZORUNLU ADIM: Projeye `pnpm simulate` Eklenmesi

> [!IMPORTANT]
> Projenizde bu kütüphaneyi kullanırken **`pnpm simulate` komutunun eklenmesi ve CI/CD süreçlerinde koşturulması ZORUNLUDUR.**

### Neden `pnpm simulate` Zorunludur?
1. **Regresyon Koruması:** Yeni bir React bileşeni eklendiğinde veya Zod şeması değiştiğinde ajanın arayüzle uyumu bozulabilir.
2. **Kör Uçuşu Önleme:** Ajanın gerçek modellerle olan etkileşimi (token maliyetleri, truncation, HITL onayları, rollback) görsel olarak test edilemez; deterministik bir simülasyon testi gereklidir.
3. **Tam Mimari Güvence:** 16 kritik mimari aşamanın (Preflight, HITL, Steering, Truncation, Multi-Lane, CBOR, Reconcile vb.) her derlemede %100 başarıyla geçtiği doğrulanır.

### `package.json` Yapılandırması

Projenizin `package.json` dosyasına şu komutları ekleyin:

```json
{
  "scripts": {
    "test": "vitest run",
    "simulate": "vitest run src/agent-simulation.test.ts"
  }
}
```

### Simülasyon Dosyası Şablonu (`agent-simulation.test.ts`)

Projenizin `src/` klasörü altına [`agent-simulation.test.ts`](../packages/agent-core/src/agent-simulation.test.ts) dosyasını ekleyin:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  uiRegistry,
  uiEventBus,
  executeComponentAction,
  hookPipeline,
  sessionManager,
  steeringManager,
  telemetryTracker,
  truncateContent,
  mutationLine,
  agentMemory,
  agentUiTools,
  skillsManager,
  multiLaneScheduler,
  progressManager,
  reconciliationEngine,
  cborCodec,
  retryWithBackoff,
} from '@my-agent/core';

describe('🤖 Headless UI-Agent 16 Aşamalı Uçtan Uca Simülasyonu', () => {
  // Ortamı Sıfırla
  uiRegistry.clear();
  uiEventBus.clear();
  agentMemory.clear();
  sessionManager.reset();

  // 1. Test Bileşeni Kaydı
  uiRegistry.register({
    id: 'filter_form',
    actions: {
      SET_FIELDS: {
        schema: z.object({
          storeId: z.string().min(1),
          dateRange: z.string().regex(/^\d{4}-\d{2}$/),
        }),
        whenToCall: 'Filtre girmek için çağrılır.',
        whenNotToCall: 'Form doluyken tekrar çağrılmamalıdır.',
      },
      SUBMIT: {
        schema: z.object({}),
        whenToCall: 'Raporu çalıştırmak için çağrılır.',
        whenNotToCall: 'Filtreler eksikken çağrılmamalıdır.',
      },
    },
  });

  uiEventBus.subscribe('filter_form', (action) => ({ success: true, action }));

  it('Aşama 1: Zod Preflight ve Kendi Kendini Onarma (Self-Healing)', async () => {
    // Hatalı tarih formatı gönder
    const badRes = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026/09/15' },
    });
    expect(badRes.success).toBe(false);

    // Düzeltilmiş doğru formatla tekrar çağır
    const okRes = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026-09' },
    });
    expect(okRes.success).toBe(true);
  });

  it('Aşama 2: Human-in-the-Loop (HITL) beforeToolCall Onay Döngüsü', async () => {
    let prompted = false;
    const unsub = hookPipeline.beforeToolCall(async (ctx) => {
      if (ctx.args?.action === 'SUBMIT') {
        prompted = true;
        return {}; // Onaylandı
      }
      return {};
    });

    const res = await executeComponentAction({ component_id: 'filter_form', action: 'SUBMIT' });
    expect(prompted).toBe(true);
    expect(res.success).toBe(true);
    unsub();
  });

  it('Aşama 3: Steering (Araya Girme) ve Follow-up Kuyruğu', () => {
    steeringManager.clear();
    steeringManager.steer('Kadıköy yerine Beşiktaş seç.');
    expect(steeringManager.hasSteering()).toBe(true);
    expect(steeringManager.popSteer()?.content).toContain('Beşiktaş');
  });

  it('Aşama 4: Dual-Bound Truncation (Token Guard)', () => {
    const huge = Array.from({ length: 500 }, (_, i) => `Satır ${i}`).join('\n');
    const truncated = truncateContent(huge, { maxLines: 10, maxBytes: 500 });
    expect(truncated.truncated).toBe(true);
  });

  it('Aşama 5: MutationLine Atomik Sıralama', async () => {
    const seq: number[] = [];
    await Promise.all([
      mutationLine.enqueue(async () => { seq.push(1); }),
      mutationLine.enqueue(async () => { seq.push(2); }),
    ]);
    expect(seq).toEqual([1, 2]);
  });

  it('Aşama 6: Zaman Yolculuğu (Undo / Redo)', () => {
    sessionManager.checkpoint('Durum 1', { step: 1 });
    sessionManager.checkpoint('Durum 2', { step: 2 });
    expect(sessionManager.undo()?.label).toBe('Durum 1');
    expect(sessionManager.redo()?.label).toBe('Durum 2');
  });

  it('Aşama 7: Telemetri & Token Maliyet Hesaplama', () => {
    telemetryTracker.reset();
    telemetryTracker.setModelPricing(0.15, 0.60);
    telemetryTracker.startTurn();
    telemetryTracker.recordToolExecution('dispatch_component_action', true, 50);
    const metric = telemetryTracker.endTurn(10_000, 2_000);
    expect(metric.estimatedCostUsd).toBeCloseTo(0.0027, 4);
  });

  it('Aşama 8: Ajan Hafıza CRUD (Memory)', async () => {
    agentMemory.remember('store', 'Kadıköy', 'session');
    expect(agentMemory.recall('store')).toBe('Kadıköy');
    agentMemory.forget('store');
    expect(agentMemory.recall('store')).toBeUndefined();
  });

  it('Aşama 9: Multi-Lane Öncelikli Yürütme Kuyruğu', async () => {
    multiLaneScheduler.clear();
    const res = await multiLaneScheduler.enqueue('interactive', 'Test', async () => 'done');
    expect(res).toBe('done');
  });

  it('Aşama 10: Araç İlerleme Akışı (Progress Tracking)', () => {
    const events: number[] = [];
    const unsub = progressManager.subscribe((u) => events.push(u.percentage));
    const rep = progressManager.createReporter('c1', 'tool');
    rep.report(50, 'İşleniyor');
    rep.done();
    expect(events).toEqual([50, 100]);
    unsub();
  });

  it('Aşama 11: Kilitlenme Kurtarma (Reconciliation)', () => {
    reconciliationEngine.simulateCrashOrphan('orphan_1', 'dispatch');
    const res = reconciliationEngine.reconcile();
    expect(res.hasInconsistencies).toBe(true);
    expect(reconciliationEngine.reconcile().hasInconsistencies).toBe(false);
  });

  it('Aşama 12: CBOR (RFC 8949) İkili Sıkıştırma', () => {
    const data = { foo: 'bar', nums: [1, 2, 3] };
    const encoded = cborCodec.encode(data);
    expect(cborCodec.decode(encoded)).toEqual(data);
  });

  it('Aşama 13: Üstel Geri Çekilme (Exponential Backoff)', async () => {
    let attempts = 0;
    const res = await retryWithBackoff(async (i) => {
      attempts = i;
      if (i < 2) throw new Error('Hata');
      return 'OK';
    }, { maxAttempts: 3, baseDelayMs: 5 });
    expect(res).toBe('OK');
    expect(attempts).toBe(2);
  });
});
```

### CI/CD Entegrasyonu

GitHub Actions, GitLab CI veya Bitbucket Pipelines yapılandırmanıza `pnpm simulate` adımını derleme ve deploy öncesine ekleyin:

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm typecheck
      
      # ZORUNLU: Ajan Simülasyon Testini Koştur
      - name: Run Agent Simulation
        run: pnpm simulate
        
      - run: pnpm build
```

---

## 🎯 Özet Kontrol Listesi (Checklist)

Hedef projenizde entegrasyonu tamamladıktan sonra aşağıdaki kontrol listesini doğrulayın:

- [ ] Kök düzeyde `<AgentProvider>` sarmalaması yapıldı mı?
- [ ] Kontrol edilecek tüm bileşenler `useAgentComponent` ile bağlandı mı?
- [ ] Tüm eylemler için `actions: { [action]: { schema, whenToCall, whenNotToCall } }` sözleşmeleri tanımlandı mı?
- [ ] `/api/chat` uç noktası `createAgentToolsForServer` ile kuruldu mu?
- [ ] `package.json` dosyasına `"simulate": "vitest run src/agent-simulation.test.ts"` eklendi mi?
- [ ] `pnpm simulate` çalıştırıldığında tüm aşamalar yeşil (PASS) geçiyor mu?
