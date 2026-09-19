import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText, tool, isStepCount, convertToModelMessages } from 'ai';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { loadAuthFile, resolveApiKey } from '../../packages/agent-core/src/auth';
import {
  loadModelsFile,
  resolveDefaultProvider,
  getAvailableModels,
  resolveProviderAndModel,
} from '../../packages/agent-core/src/models-config';
import { skillsManager } from '../../packages/agent-core/src/skills';
import { agentMemory } from '../../packages/agent-core/src/memory';
import { createAgentToolsForServer } from '../../packages/agent-core/src/standard-tools';
import { formatActiveComponentsPrompt } from '../../packages/agent-core/src/component-registry';
import { telemetryTracker } from '../../packages/agent-core/src/telemetry-metrics';
import { oauthManager } from '../../packages/agent-core/src/oauth';
import { pluginRegistry } from '../../packages/agent-core/src/plugins';
import { loyaltyDiscountPlugin } from './src/plugins/loyaltyDiscountPlugin';
import { SUMMARIZATION_SYSTEM_PROMPT, generateLocalSummary } from '../../packages/agent-core/src/compaction';

// Custom plugin'leri sunucu ajanına bir kez tak (kart promptları gerçekten çalışsın)
await pluginRegistry.register(loyaltyDiscountPlugin as any);

function resolveLocalOrDefault(localPath: string): string | undefined {
  return existsSync(localPath) ? localPath : undefined;
}

const localModelsPath = resolveLocalOrDefault(path.resolve(import.meta.dirname, 'models.json'));
const localAuthPath = resolveLocalOrDefault(path.resolve(import.meta.dirname, 'auth.json'));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'agnes-ai-chat-endpoint',
      configureServer(server) {
        // OAuth Sağlayıcı Listesi
        server.middlewares.use('/api/auth/oauth/providers', (req: IncomingMessage, res: ServerResponse) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(oauthManager.listProviders()));
        });

        // OAuth Başlatma
        server.middlewares.use('/api/auth/oauth/start', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }
          let body = '';
          req.on('data', (c) => { body += c.toString(); });
          req.on('end', async () => {
            try {
              const { provider, redirectUri } = JSON.parse(body || '{}');
              const result = await oauthManager.startLogin(provider, redirectUri);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err?.message || 'OAuth başlatılamadı' }));
            }
          });
        });

        // OAuth Kod Takası (PKCE Exchange)
        server.middlewares.use('/api/auth/oauth/exchange', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }
          let body = '';
          req.on('data', (c) => { body += c.toString(); });
          req.on('end', async () => {
            try {
              const { provider, code, verifier, redirectUri } = JSON.parse(body || '{}');
              const credential = await oauthManager.exchangeCode(
                provider,
                { code, verifier, redirectUri },
                localAuthPath,
              );
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ success: true, provider, type: credential.type }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err?.message || 'Kod takası başarısız' }));
            }
          });
        });

        // OAuth Device Code Polling
        server.middlewares.use('/api/auth/oauth/poll', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }
          let body = '';
          req.on('data', (c) => { body += c.toString(); });
          req.on('end', async () => {
            try {
              const { provider, info } = JSON.parse(body || '{}');
              const credential = await oauthManager.pollDevice(provider, info, undefined, localAuthPath);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ success: true, provider, type: credential.type }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err?.message || 'Cihaz akışı başarısız' }));
            }
          });
        });

        // Mevcut modelleri ve auth uygunluk durumlarını dönen endpoint
        server.middlewares.use('/api/models', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }
          try {
            const mConfig = loadModelsFile(localModelsPath);
            const aData = loadAuthFile(localAuthPath);
            const models = getAvailableModels(mConfig, aData);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                defaultProvider: mConfig.defaultProvider,
                defaultModel: mConfig.defaultModel,
                models,
              }),
            );
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: err?.message || 'Modeller yüklenemedi' }));
          }
        });

        // Context Compaction / Otomatik Özetleme Endpoint'i
        server.middlewares.use('/api/compact', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const {
                serializedText = '',
                model: requestedModel,
                provider: requestedProvider,
                customInstructions,
              } = JSON.parse(body || '{}');

              const mConfig = loadModelsFile(localModelsPath);
              let aData = loadAuthFile(localAuthPath);
              const target = resolveProviderAndModel(mConfig, requestedProvider, requestedModel);

              const targetCred = aData[target.providerId];
              if (targetCred?.type === 'oauth') {
                await oauthManager.refreshTokenIfNeeded(target.providerId, targetCred as any, undefined, localAuthPath);
                aData = loadAuthFile(localAuthPath);
              }

              const { apiKey } = resolveApiKey(aData, target.providerId, { authPath: localAuthPath });

              // Eğer API Key veya BaseUrl varsa LLM ile özetle
              if (apiKey || target.baseUrl) {
                try {
                  const client = createOpenAI({
                    baseURL: target.baseUrl,
                    apiKey,
                  });

                  const promptContent = customInstructions
                    ? `${serializedText}\n\nÖzel Talimat:\n${customInstructions}`
                    : serializedText;

                  const aiResponse = await generateText({
                    model: client.chat(target.model),
                    system: SUMMARIZATION_SYSTEM_PROMPT,
                    prompt: promptContent,
                  });

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ summary: aiResponse.text }));
                  return;
                } catch (llmErr) {
                  console.warn('[Auto-Compact LLM Fallback to local]:', llmErr);
                }
              }

              // Fallback: Yerel kural tabanlı özetleme
              const localSummary = generateLocalSummary(serializedText);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ summary: localSummary }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err?.message || 'Compaction hatası' }));
            }
          });
        });

        // Oturumlar arası kalıcı form alan takip belleği
        const serverSessionMemory: Record<string, any> = {};

        server.middlewares.use('/api/chat', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const {
                messages,
                uiContext,
                model: requestedModel,
                provider: requestedProvider,
              } = JSON.parse(body || '{}');

              // İstenen veya varsayılan modeli ve sağlayıcıyı dinamik çöz
              const mConfig = loadModelsFile(localModelsPath);
              let aData = loadAuthFile(localAuthPath);
              const target = resolveProviderAndModel(mConfig, requestedProvider, requestedModel);

              // OAuth token süresi bitmeye yakınsa otomatik yenile
              const targetCred = aData[target.providerId];
              if (targetCred?.type === 'oauth') {
                await oauthManager.refreshTokenIfNeeded(target.providerId, targetCred as any, undefined, localAuthPath);
                aData = loadAuthFile(localAuthPath);
              }

              const { apiKey } = resolveApiKey(aData, target.providerId, { authPath: localAuthPath });

              const client = createOpenAI({
                baseURL: target.baseUrl,
                apiKey,
              });

              // UI Context Snapshot'ı Sistem Promptuna Enjekte Ediyoruz
              const activeComps: Array<{ id: string; capabilities: string[]; meta?: Record<string, any> }> = uiContext?.active_components || [];
              const recentEvents = uiContext?.recent_events || [];

              // İstemciden gelen güncel React form durumunu ve geçmiş olayları oturum hafızasına işle
              const filterComp = activeComps.find((c) => c.id === 'filter_form');
              const clientValues = filterComp?.meta?.currentValues || {};
              if (clientValues.storeId) serverSessionMemory.storeId = clientValues.storeId;
              if (clientValues.dateRange) serverSessionMemory.dateRange = clientValues.dateRange;

              for (const ev of recentEvents) {
                if (ev.source === 'filter_form' && ev.payload) {
                  if (ev.payload.storeId) serverSessionMemory.storeId = ev.payload.storeId;
                  if (ev.payload.dateRange) serverSessionMemory.dateRange = ev.payload.dateRange;
                }
              }

              const activeComponentIds = activeComps.map((c) => c.id);
              const skillsPrompt = skillsManager.formatSkillsPrompt(uiContext?.route || '/', activeComponentIds);
              const memoryPrompt = agentMemory.formatMemoryPrompt();
              const activeComponentsPrompt = formatActiveComponentsPrompt(activeComps);

              const systemPrompt = `Sen bu web uygulamasındaki interaktif React UI Agent asistanısın.
Kullanıcının Türkçe taleplerini anla ve aşağıdaki standart araçları kullanarak arayüzü yönet veya bilgi ver:
1. 'dispatch_component_action': Ekrandaki aktif bileşenlere aksiyon iletmek için. (Aşağıdaki WHEN TO CALL ve WHEN NOT TO CALL kurallarına KESİNLİKLE uy).
2. 'inspect_ui_state': Ekrandaki aktif bileşenleri ve ring buffer telemetri olaylarını incelemek için.
3. 'remember_fact': Kullanıcı tercih veya talimatlarını (örn: favori mağaza, para birimi, dil) hafızaya kaydetmek için.
4. 'recall_fact': Hafızadaki bilgileri sorgulamak veya hatırlamak için.
5. 'forget_fact': Kullanıcı "bunu unut", "hafızadan sil" dediğinde bilgiyi silmek için.
6. 'time_travel': Kullanıcı "geri al", "önceki adıma dön", "undo" veya "redo" dediğinde sayfa durumunu zamanda geri/ileri almak için.
7. 'apply_vip_discount': Kullanıcı VIP indirimi, sadakat kuponu veya iskonto istediğinde (örn: Kadıköy-VIP-101'e %20) kupon tanımlamak için. %40 üzeri oranları reddet.
8. 'ask_user_choice': Kullanıcıya netleştirmek, onay almak veya seçenek sunmak istediğinde (örn: mağaza, tarih aralığı, onay) etkileşimli buton çipleri sunmak için.

${activeComponentsPrompt}

Son gerçekleşen UI olayları (Ring Buffer Telemetri):
${JSON.stringify(recentEvents, null, 2)}

${skillsPrompt}

${memoryPrompt}

HATA VE KENDİ KENDİNİ ONARMA (SELF-HEALING) ZORUNLU KURALLARI:
1. ZOD VALIDASYON HATASI (KENDİ KENDİNİ ONARMA - SELF-HEALING):
   - Bir araç çağrısı (özellikle 'dispatch_component_action') Zod Şema Validasyon Hatası alırsa (örneğin dateRange için '2026/09/15' veya YYYY/MM/DD gibi gün bilgisi içeren bir format verilmişse):
   - KESİNLİKLE durup kullanıcıya "düzelteyim mi, onaylıyor musunuz?" diye soru sorma!
   - AYNI ADIMDA (multi-step tool call hakkını kullanarak) argümanı derhal geçerli formata dönüştür (örn: '2026/09/15' -> '2026-09') ve 'dispatch_component_action' ARACINI DERHAL TEKRAR ÇAĞIR!
   - Araç başarıyla çalıştıktan sonra kullanıcıya: "Zod validasyon kalkanı '2026/09/15' formatını reddetti; sistem kendini otomatik onararak (Self-Healing) dönemi '2026-09' olarak düzeltti ve form alanlarını güncelledi." şeklinde açıkla.
2. EYLEM ÇAĞRISI ÖNCELİĞİ:
   - Kullanıcı "filtreye yaz", "güncelle", "seç" veya "sırala" dediğinde sadece lafta kalma; işlemi 'dispatch_component_action' aracını çağırarak MUTLAKA EKRANA YANSIT.
3. 'filter_form' formu için hem 'storeId' (örn: Kadıköy) hem de 'dateRange' (örn: 2026-09) ZORUNLUDUR.
4. 'SUBMIT' VE SAYFA YÖNLENDİRMESİ (NAVIGATE):
   - Kullanıcı "çalıştır", "raporu getir", "gör" veya "sonuçları göster" dediğinde:
     - 'filter_form' bileşeninin 'SUBMIT' eylemini çağır.
     - Eğer kullanıcı şu anda '/reports' sayfasında değilse (örneğin '/' Ana Sayfa'daysa), formu ve sonuç tablosunu ekranda görebilmesi için 'app_router' bileşeninin 'NAVIGATE' eylemini ({ "path": "/reports" }) ile de çağır!
5. SEÇENEK SUNMA & KARAR NETLEŞTİRME KURALI:
   - Kullanıcının talebinde belirsizlik olduğunda veya birden fazla alternatif sunman gerektiğinde (örneğin "Kadıköy mü Beşiktaş mı?", "Hangi dönemi istersiniz?", "Onaylıyor musunuz?"), düz metin yerine MUTLAKA 'ask_user_choice' aracını çağırarak tıklanabilir buton seçenekleri sun.
`;

              const result = streamText({
                model: client.chat(target.model),
                system: systemPrompt,
                messages: await convertToModelMessages(messages ?? []),
                tools: {
                  ...createAgentToolsForServer(uiContext, {
                  actions: {
                    filter_form: {
                      SET_FIELDS: {
                        schema: z.object({
                          storeId: z.string().min(1, 'storeId boş olamaz').optional(),
                          dateRange: z.string().regex(/^\d{4}-\d{2}$/, 'dateRange YYYY-MM formatında olmalıdır (örn: 2026-09)').optional(),
                        }),
                      },
                    },
                    app_router: {
                      NAVIGATE: {
                        schema: z.object({
                          path: z.string().min(1, 'Geçerli bir rota yolu belirtilmelidir (örn: /dashboard veya /reports)'),
                        }),
                      },
                    },
                    result_table: {
                      SORT: {
                        schema: z.object({
                          column: z.string().min(1, 'Sıralama kolonu belirtilmelidir'),
                          direction: z.enum(['asc', 'desc']),
                        }),
                      },
                    },
                  },
                  onValidateAction: ({ component_id, action, payload }) => {
                    if (component_id === 'filter_form') {
                      if (action === 'SET_FIELDS') {
                        if (payload?.storeId) serverSessionMemory.storeId = payload.storeId;
                        if (payload?.dateRange) serverSessionMemory.dateRange = payload.dateRange;
                      }
                      if (action === 'SUBMIT') {
                        const effStore = payload?.storeId || serverSessionMemory.storeId || clientValues.storeId;
                        const effDate = payload?.dateRange || serverSessionMemory.dateRange || clientValues.dateRange;
                        if (!effStore || !effDate) {
                          const missing = [!effStore ? 'storeId' : null, !effDate ? 'dateRange' : null].filter(Boolean);
                          return {
                            valid: false,
                            error: `Validasyon Hatası: Form eksik alanlar içeriyor (${missing.join(', ')}). Rapor çalıştırılamadı.`,
                          };
                        }
                      }
                    }
                  },
                }),
                  // Custom plugin araçları (örn: apply_vip_discount)
                  ...pluginRegistry.getCustomTools(),
                },
                stopWhen: isStepCount(5),
                onFinish({ usage }) {
                  if (usage) {
                    telemetryTracker.endTurn(
                      usage.inputTokens ?? 0,
                      usage.outputTokens ?? 0,
                      target.cost,
                    );
                  }
                },
              });

              result.pipeUIMessageStreamToResponse(res);
            } catch (err: any) {
              console.error('[Agnes AI Error]:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end(`0:${JSON.stringify('Üzgünüm, bir hata oluştu: ' + (err?.message || 'Bilinmeyen hata'))}\n`);
            }
          });
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@my-agent/core': path.resolve(import.meta.dirname, '../../packages/agent-core/src/index.ts'),
      '@my-agent/react': path.resolve(import.meta.dirname, '../../packages/agent-react/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'ai-vendor': ['ai', '@ai-sdk/openai', 'zod'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
});
