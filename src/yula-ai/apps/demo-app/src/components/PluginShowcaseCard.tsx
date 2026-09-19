import React, { useState } from 'react';
import { useAgentPlugin } from '@my-agent/react';
import { hookPipeline, piEventStream } from '@my-agent/core';
import { loyaltyDiscountPlugin } from '../plugins/loyaltyDiscountPlugin';

interface PluginShowcaseCardProps {
  onLog: (msg: string) => void;
}

export function PluginShowcaseCard({ onLog }: PluginShowcaseCardProps) {
  const [isEnabled, setIsEnabled] = useState(true);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Reaktif Custom Plugin Bağlantısı: isEnabled true ise mount olur, false ise unmount olur
  useAgentPlugin(isEnabled ? loyaltyDiscountPlugin : null);

  const testValidDiscount = async () => {
    if (!isEnabled) {
      alert('Eklenti şu an devre dışı. Lütfen önce eklentiyi aktifleştirin.');
      return;
    }

    const tool = loyaltyDiscountPlugin.tools?.apply_vip_discount;
    if (!tool) return;

    onLog('🔌 [Plugin Testi]: %20 VIP indirimi uygulanıyor...');
    piEventStream.emit({
      type: 'tool_execution_start',
      toolCallId: `call_vip_20_${Date.now()}`,
      toolName: 'apply_vip_discount',
      args: { customerId: 'Kadıköy-VIP-101', discountPercentage: 20 },
      timestamp: Date.now(),
    });

    const res = await tool.execute({
      customerId: 'Kadıköy-VIP-101',
      discountPercentage: 20,
    });

    setLastResult(`✅ Başarılı: ${res.message}`);
    onLog(`✅ [Plugin Sonucu]: ${res.message}`);
  };

  const testBlockedDiscount = async () => {
    if (!isEnabled) {
      alert('Eklenti şu an devre dışı. Lütfen önce eklentiyi aktifleştirin.');
      return;
    }

    onLog('🛡️ [Plugin Hook Testi]: %45 indirim deneniyor (Kural engeli bekleniyor)...');

    // Hook Pipeline kontrolü
    const hookCheck = await hookPipeline.runBeforeHooks({
      toolName: 'apply_vip_discount',
      toolCallId: `call_vip_45_${Date.now()}`,
      args: { customerId: 'Kadıköy-VIP-999', discountPercentage: 45 },
      activeComponents: [],
    });

    if (hookCheck?.block) {
      const msg = `⛔ ENGELLEDİ: ${hookCheck.block.reason}`;
      setLastResult(msg);
      onLog(`⛔ [Plugin Guard]: ${msg}`);
      alert(msg);
    }
  };

  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        backgroundColor: isEnabled ? '#f0fdf4' : '#f8fafc',
        border: `1px solid ${isEnabled ? '#86efac' : '#e2e8f0'}`,
        borderRadius: 8,
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13, color: '#166534' }}>
              🔌 Custom Plugin: {loyaltyDiscountPlugin.name}
            </strong>
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                backgroundColor: isEnabled ? '#dcfce7' : '#e2e8f0',
                color: isEnabled ? '#15803d' : '#64748b',
                fontWeight: 700,
              }}
            >
              {isEnabled ? '🟢 AKTİF (Mount)' : '⚪ DEVRE DIŞI (Unmount)'}
            </span>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#15803d' }}>
            {loyaltyDiscountPlugin.description}
          </p>
        </div>

        <button
          onClick={() => {
            const next = !isEnabled;
            setIsEnabled(next);
            onLog(next ? '🔌 [Plugin]: loyaltyDiscountPlugin sisteme yüklendi.' : '🔌 [Plugin]: loyaltyDiscountPlugin sistemden kaldırıldı.');
          }}
          style={{
            padding: '5px 12px',
            backgroundColor: isEnabled ? '#dc2626' : '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isEnabled ? 'Eklentiyi Kaldır (Unmount)' : 'Eklentiyi Bağla (Mount)'}
        </button>
      </div>

      {isEnabled && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #bbf7d0', fontSize: 11, color: '#14532d' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            <div style={{ backgroundColor: '#ffffff', padding: 6, borderRadius: 4, border: '1px solid #bbf7d0' }}>
              <strong>✨ Eklenen Beceri (Skill):</strong> <code>vip-loyalty-skill</code>
              <div style={{ color: '#64748b', fontSize: 10 }}>Asistan widget'ında Beceriler sekmesine anında yansır.</div>
            </div>
            <div style={{ backgroundColor: '#ffffff', padding: 6, borderRadius: 4, border: '1px solid #bbf7d0' }}>
              <strong>🛠️ Eklenen Araç (Tool):</strong> <code>apply_vip_discount</code>
              <div style={{ color: '#64748b', fontSize: 10 }}>Maks %40 indirim kancası (Guard Hook) korumalıdır.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={testValidDiscount}
              style={{
                padding: '4px 10px',
                backgroundColor: '#15803d',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              🧪 VIP Kuponu Çalıştır (%20 İndirim)
            </button>
            <button
              onClick={testBlockedDiscount}
              style={{
                padding: '4px 10px',
                backgroundColor: '#b91c1c',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              🛡️ Kural İhlali Testi (%45 İndirim - Hook Engeller)
            </button>
          </div>

          {lastResult && (
            <div style={{ marginTop: 8, padding: 6, backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid #86efac', fontWeight: 600 }}>
              {lastResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
