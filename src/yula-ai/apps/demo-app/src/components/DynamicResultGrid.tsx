import React, { useState } from 'react';
import { sessionManager, piEventStream } from '@my-agent/core';
import { useAgentComponent } from '@my-agent/react';
import { z } from 'zod';

interface DynamicResultGridProps {
  storeId: string;
  onBack: () => void;
  onLog: (msg: string) => void;
}

export function DynamicResultGrid({ storeId, onBack, onLog }: DynamicResultGridProps) {
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useAgentComponent({
    id: 'result_table',
    capabilities: ['SORT', 'EXPORT_CSV'],
    executionMode: 'sequential',
    actions: {
      SORT: {
        description: 'Sonuç tablosundaki satırları stok miktarına göre artan veya azalan sırada sıralar.',
        schema: z.object({
          direction: z.enum(['asc', 'desc']).optional(),
        }),
        whenToCall: 'Kullanıcı verileri sıralamak, en çok veya en az stoklu ürünleri görmek istediğinde.',
        whenNotToCall: 'Kullanıcı sadece tablodaki verileri okumak istediğinde veya filtre aşamasındayken çağrılmamalıdır.',
      },
      EXPORT_CSV: {
        description: 'Tablo verilerini CSV dosyası olarak dışa aktarır ve indirir.',
        schema: z.object({}).optional(),
        whenToCall: 'Kullanıcı açıkça "CSV indir", "Excel\'e aktar" veya "dışa aktar" dediğinde.',
        whenNotToCall: 'Kullanıcı sadece verileri incelemek istediğinde veya tablo boşken çağrılmamalıdır.',
      },
    },
    onAction: (action, payload: any) => {
      onLog(`[result_table Action]: ${action} ${payload ? JSON.stringify(payload) : ''}`);
      if (action === 'SORT') {
        const next = payload?.direction || (sortOrder === 'asc' ? 'desc' : 'asc');
        setSortOrder(next);
        sessionManager.checkpoint(`Tablo Sıralandı (${next})`, { storeId, sortOrder: next, stage: 'RESULT' });
        return { success: true, direction: next };
      }
      if (action === 'EXPORT_CSV') {
        alert('CSV dosyası başarıyla indirildi.');
        return { success: true };
      }
    },
  });

  const mockRows = [
    { sku: 'ELK-01', name: 'Kablosuz Kulaklık', stock: sortOrder === 'asc' ? 14 : 95, price: '₺1.250' },
    { sku: 'ELK-02', name: 'Mekanik Klavye', stock: 45, price: '₺2.400' },
    { sku: 'ELK-03', name: 'Ultra HD Monitör', stock: sortOrder === 'asc' ? 95 : 14, price: '₺8.900' },
  ];

  const handleSort = () => {
    const next = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(next);
    sessionManager.checkpoint(`Tablo Sıralandı (${next})`, { storeId, sortOrder: next, stage: 'RESULT' });
    piEventStream.emit({
      type: 'tool_execution_start',
      toolCallId: 'grid_sort',
      toolName: 'dispatch_component_action',
      args: { component_id: 'result_table', action: 'SORT', payload: { direction: next } },
    });
    piEventStream.emit({
      type: 'tool_execution_end',
      toolCallId: 'grid_sort',
      toolName: 'dispatch_component_action',
      result: { success: true, direction: next },
      isError: false,
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
          📍 {storeId} Mağazası Satış Verileri
        </h3>
        <span
          style={{
            fontSize: 12,
            backgroundColor: '#dbeafe',
            color: '#1e40af',
            padding: '4px 8px',
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          Sıralama: {sortOrder.toUpperCase()}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
        <thead>
          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>SKU</th>
            <th style={{ padding: '8px 12px' }}>Ürün</th>
            <th style={{ padding: '8px 12px' }}>Stok</th>
            <th style={{ padding: '8px 12px' }}>Fiyat</th>
          </tr>
        </thead>
        <tbody>
          {mockRows.map((r) => (
            <tr key={r.sku} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.sku}</td>
              <td style={{ padding: '8px 12px' }}>{r.name}</td>
              <td style={{ padding: '8px 12px' }}>{r.stock} adet</td>
              <td style={{ padding: '8px 12px' }}>{r.price}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleSort}
          style={{
            padding: '8px 16px',
            backgroundColor: '#0f172a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          🔄 Sırala ({sortOrder === 'asc' ? 'Artan' : 'Azalan'})
        </button>
        <button
          onClick={() => alert('CSV dosyası indirildi.')}
          style={{
            padding: '8px 16px',
            backgroundColor: '#10b981',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          📥 CSV İndir
        </button>
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            backgroundColor: '#e2e8f0',
            color: '#334155',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ← Kriterlere Dön
        </button>
      </div>
    </div>
  );
}
