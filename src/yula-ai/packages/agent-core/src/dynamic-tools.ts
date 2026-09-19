import { z } from 'zod';
import { tool } from './types';
import { uiRegistry } from './component-registry';
import { executeComponentAction, ExecuteActionResult } from './standard-tools';

/**
 * Pi Dynamic Tool Loadouts
 * O an ekranda mount edilmiş bileşenlerin kabiliyetlerinden dinamik Vercel AI SDK araçları üretir.
 */
export function buildDynamicToolsFromRegistry(): Record<string, any> {
  const activeComponents = uiRegistry.getActiveComponents();

  if (activeComponents.length === 0) {
    return {};
  }

  const validComponentIds = activeComponents.map((c) => c.id);

  // Ekranda aktif olan bileşenlere göre dinamik Zod şeması
  return {
    dispatch_component_action: tool({
      description: `Ekranda şu an aktif olan UI bileşenlerine (${validComponentIds.join(', ')}) tip güvenli komut gönderir.`,
      inputSchema: z.object({
        component_id: z.string().describe(`Hedef bileşen (Aktifler: ${validComponentIds.join(', ')})`),
        action: z.string().describe('Tetiklenecek aksiyon adı'),
        payload: z.record(z.string(), z.any()).optional().describe('Aksiyona ait parametreler'),
      }),
execute: async ({ component_id, action, payload }): Promise<ExecuteActionResult> => {
      return executeComponentAction({ component_id, action, payload });
    },
    }),
  };
}
