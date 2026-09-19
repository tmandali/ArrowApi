import { piEventStream, uiEventBus } from '@my-agent/core';
import { useAgentComponent } from './use-agent-component';
import { z } from 'zod';

export interface UseAgentRouterOptions {
  currentRoute: string;
  onNavigate: (path: string, options?: { replace?: boolean }) => void;
  onBack?: () => void;
  availableRoutes?: string[];
  id?: string;
}

/**
 * Pi-Style Event-Driven UI Router Hook
 * 
 * Uygulamanın yönlendiricisini (React Router, Next.js, TanStack Router vb.)
 * doğrudan bir Agent UI bileşeni olarak sisteme bağlar.
 * Agent, ayrı bir 'navigate_to' aracı yerine temel 'dispatch_component_action'
 * aracı üzerinden reaktif bir şekilde ekranlar arası geçiş yapabilir.
 */
export function useAgentRouter({
  currentRoute,
  onNavigate,
  onBack,
  availableRoutes = [],
  id = 'app_router',
}: UseAgentRouterOptions) {
  useAgentComponent({
    id,
    capabilities: ['NAVIGATE', ...(onBack ? ['BACK'] : [])],
    meta: {
      currentRoute,
      availableRoutes,
    },
    actions: {
      NAVIGATE: {
        description: 'Uygulama içinde belirtilen rota sayfasına geçiş yapar.',
        schema: z.object({
          path: z.string().min(1, 'Hedef rota (path) zorunludur'),
          replace: z.boolean().optional(),
          reason: z.string().optional(),
        }),
        whenToCall: 'Kullanıcı açıkça başka bir sayfaya gitmek veya ekranı değiştirmek istediğinde (örn: "Dashboard\'a git", "Raporlar sayfasına geç").',
        whenNotToCall: 'Kullanıcı sadece sayfadaki veriler hakkında soru sorduğunda veya form doldururken KESİNLİKLE kendi başına çağrılmamalıdır.',
      },
      ...(onBack
        ? {
            BACK: {
              description: 'Tarayıcı geçmişinde bir önceki sayfaya geri döner.',
              schema: z.object({}).optional(),
              whenToCall: 'Kullanıcı açıkça "geri dön", "önceki sayfaya git" dediğinde.',
              whenNotToCall: 'Kullanıcı belirli bir sayfayı hedeflediğinde veya yeni bir işlem başlattığında çağrılmamalıdır.',
            },
          }
        : {}),
    },
    onAction: (action, payload) => {
      if (action === 'NAVIGATE') {
        const target = payload?.path || payload?.to;
        if (!target) {
          return { success: false, error: 'Hedef rota (path) belirtilmedi.' };
        }

        const prev = currentRoute;
        onNavigate(target, { replace: payload?.replace });

        // Telemetri ve Olay Akışı
        uiEventBus.recordTelemetry({
          source: id,
          type: 'ROUTE_CHANGED',
          payload: { from: prev, to: target, reason: payload?.reason },
        });

        piEventStream.emit({
          type: 'route_changed',
          from: prev,
          to: target,
          reason: payload?.reason,
        });

        return {
          success: true,
          message: `"${target}" sayfasına yönlendirildi.`,
          from: prev,
          to: target,
        };
      }

      if (action === 'BACK' && onBack) {
        onBack();
        uiEventBus.recordTelemetry({
          source: id,
          type: 'ROUTE_CHANGED',
          payload: { from: currentRoute, to: 'history_back' },
        });

        return {
          success: true,
          message: 'Önceki sayfaya geri dönüldü.',
        };
      }

      return {
        success: false,
        error: `Desteklenmeyen router eylemi: "${action}". Desteklenenler: NAVIGATE${onBack ? ', BACK' : ''}`,
      };
    },
  });
}
