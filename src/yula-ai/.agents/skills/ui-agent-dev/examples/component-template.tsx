import React, { useState } from 'react';
import { z } from 'zod';
import { useAgentComponent } from '@my-agent/react';

// ==========================================
// 1. Zod Eylem ve Parametre Şemaları (Preflight)
// ==========================================
export const UpdateDataSchema = z.object({
  entityId: z.string().min(1, 'entityId zorunludur'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateDataPayload = z.infer<typeof UpdateDataSchema>;

// ==========================================
// 2. "Agent-Ready" React Bileşen Şablonu
// ==========================================
export interface AgentReadyComponentProps {
  initialStatus?: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  onStatusChange?: (status: 'ACTIVE' | 'INACTIVE' | 'PENDING') => void;
}

export const AgentReadyComponent: React.FC<AgentReadyComponentProps> = ({
  initialStatus = 'ACTIVE',
  onStatusChange,
}) => {
  const [currentStatus, setCurrentStatus] = useState(initialStatus);

  // useAgentComponent kancası ile bileşeni otomatik kaydet ve dinle
  useAgentComponent({
    id: 'status_control_card',
    capabilities: ['UPDATE_STATUS', 'RESET'],
    actionSchemas: {
      UPDATE_STATUS: UpdateDataSchema,
      RESET: z.object({}),
    },
    actions: {
      UPDATE_STATUS: {
        schema: UpdateDataSchema,
        whenToCall: 'Kullanıcı bir varlığın durumunu ACTIVE, INACTIVE veya PENDING yapmak istediğinde çağrılır.',
        whenNotToCall: 'Durum zaten istenen değerdeyse veya yetkisiz kullanıcı işleminde çağrılmamalıdır.',
      },
      RESET: {
        schema: z.object({}),
        whenToCall: 'Kullanıcı durumu başlangıç varsayılanına döndürmek istediğinde çağrılır.',
        whenNotToCall: 'Durum zaten varsayılandayken çağrılmamalıdır.',
      },
    },
    onAction: (action, payload) => {
      if (action === 'UPDATE_STATUS') {
        setCurrentStatus(payload.status);
        onStatusChange?.(payload.status);
        return {
          success: true,
          message: `Durum başarıyla "${payload.status}" olarak güncellendi.`,
        };
      }

      if (action === 'RESET') {
        setCurrentStatus('ACTIVE');
        onStatusChange?.('ACTIVE');
        return {
          success: true,
          message: 'Durum varsayılana sıfırlandı.',
        };
      }

      return {
        success: false,
        error: `Desteklenmeyen eylem: ${action}`,
      };
    },
  });

  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h3 className="font-bold text-lg mb-2">Durum Kontrol Kartı</h3>
      <p className="text-sm text-gray-600 mb-4">
        Mevcut Durum: <span className="font-semibold text-blue-600">{currentStatus}</span>
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setCurrentStatus('ACTIVE')}
          className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
        >
          Aktif Et
        </button>
        <button
          onClick={() => setCurrentStatus('INACTIVE')}
          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
        >
          Pasife Al
        </button>
      </div>
    </div>
  );
};
