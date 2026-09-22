import { definePlugin } from '../../../../packages/agent-core/src/harness/extensions/plugins';
import { piEventStream } from '../../../../packages/agent-core/src/harness/telemetry/pi-event-stream';
import { z } from 'zod';
import { tool } from 'ai';

const vipDiscountInputSchema = z.object({
  customerId: z.string().describe('Müşteri veya mağaza kodu (örn: Kadıköy-VIP-101)'),
  discountPercentage: z.number().min(1).max(50).describe('İndirim yüzdesi (1-50 arası)'),
  couponCode: z.string().optional().describe('İsteğe bağlı özel kupon kodu'),
});

type VipDiscountInput = z.infer<typeof vipDiscountInputSchema>;

/**
 * Custom Plugin Örneği: VIP Sadakat ve İndirim Eklentisi
 * Bu eklenti sisteme bağlandığında (mount):
 * 1. 'vip-loyalty-skill' becerisini sisteme kaydeder.
 * 2. 'apply_vip_discount' özel Zod aracını dinamik olarak yükler.
 * 3. 'beforeToolCall' kancası ile %40 üzerindeki indirimleri güvenlik kuralı olarak engeller.
 * 4. Unmount edildiğinde tüm bu yetenekleri tek hamlede bellekten temizler.
 */
export const loyaltyDiscountPlugin = definePlugin({
  id: 'loyalty_discount_plugin',
  name: 'VIP Sadakat & İskonto Eklentisi',
  version: '1.2.0',
  description: 'Müşterilere özel VIP indirim kuponları tanımlama ve kampanya kuralı uygulama eklentisi.',

  skills: [
    {
      name: 'vip-loyalty-skill',
      description: 'VIP müşteri indirimlerini hesaplama ve kampanya kuralları kılavuzu',
      applicableComponents: ['filter_form', 'result_table'],
      instructions: `
- Kullanıcı VIP müşteri indirimi, sadakat kuponu veya iskonto talep ederse 'apply_vip_discount' aracını kullan.
- Standart indirim oranı %15 ile %25 arasındadır.
- %40 üzerindeki indirimler kural kancası (hook) tarafından otomatik engellenir.
- İndirim tamamlandığında kupon kodunu ve indirimli tutarı kullanıcıya bildir.
`,
    },
  ],

  tools: {
    apply_vip_discount: tool({
      description: 'VIP müşteriler için sepete veya rapora özel iskonto kuponu uygular.',
      inputSchema: vipDiscountInputSchema,
      execute: async ({ customerId, discountPercentage, couponCode }: VipDiscountInput) => {
        const finalCode = couponCode || `VIP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const result = {
          success: true,
          customerId,
          discountPercentage,
          couponCode: finalCode,
          message: `%${discountPercentage} VIP indirimi (${finalCode}) "${customerId}" için başarıyla tanımlandı!`,
        };

        piEventStream.emit({
          type: 'tool_execution_end',
          toolCallId: `call_plugin_${Date.now()}`,
          toolName: 'apply_vip_discount',
          result,
          isError: false,
          timestamp: Date.now(),
        });

        return result;
      },
    }),
  },

  beforeToolCall: async (ctx) => {
    if (ctx.toolName === 'apply_vip_discount') {
      const pct = ctx.args?.discountPercentage;
      if (pct && pct > 40) {
        return {
          block: {
            reason: `KURAL İHLALİ: %${pct} oranı izin verilen maksimum %40 indirim sınırını aşıyor (Plugin Guard Policy).`,
            terminate: true,
          },
        };
      }
    }
  },

  onInit: async ({ pluginId }) => {
    console.log(`[loyaltyDiscountPlugin] '${pluginId}' başarıyla başlatıldı ve kurallar bağlandı.`);
  },

  onDestroy: async () => {
    console.log(`[loyaltyDiscountPlugin] Eklenti kaldırıldı, bellek temizlendi.`);
  },
});
