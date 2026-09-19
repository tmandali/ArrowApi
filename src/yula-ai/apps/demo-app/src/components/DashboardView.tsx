import React from 'react';
import { useAgentComponent, useAgentSkill } from '@my-agent/react';
import { z } from 'zod';

interface DashboardViewProps {
  onNavigateToReports: () => void;
}

export function DashboardView({ onNavigateToReports }: DashboardViewProps) {
  const [selectedRegion, setSelectedRegion] = React.useState<string>('Tümü');
  const [lastRefreshed, setLastRefreshed] = React.useState<string>('Az önce');

  useAgentComponent({
    id: 'dashboard_kpi',
    capabilities: ['REFRESH_DATA', 'FILTER_REGION'],
    meta: { selectedRegion, lastRefreshed },
    actions: {
      REFRESH_DATA: {
        description: 'Dashboard KPI ve mağaza performans verilerini günceller.',
        schema: z.object({}).optional(),
        whenToCall: 'Kullanıcı "verileri yenile", "güncelle", "son durumu çek" dediğinde.',
        whenNotToCall: 'Kullanıcı sadece mevcut verileri okumak veya bölge filtrelemek istediğinde çağrılmamalıdır.',
      },
      FILTER_REGION: {
        description: 'Dashboard verilerini belirli bir coğrafi bölgeye (örn: Marmara, Ege) göre filtreler.',
        schema: z.object({
          region: z.string().min(1, 'Bölge adı zorunludur'),
        }),
        whenToCall: 'Kullanıcı belirli bir bölge için KPI sonuçlarını görmek istediğinde.',
        whenNotToCall: 'Kullanıcı tüm bölgeleri görmek istediğinde veya rapor sayfasına geçmek istediğinde çağrılmamalıdır.',
      },
    },
    onAction: (action, payload) => {
      if (action === 'REFRESH_DATA') {
        setLastRefreshed(new Date().toLocaleTimeString('tr-TR'));
        return { success: true, message: 'Dashboard verileri güncellendi.' };
      }
      if (action === 'FILTER_REGION') {
        setSelectedRegion(payload?.region || 'Marmara');
        return { success: true, message: `Bölge filtresi "${payload?.region || 'Marmara'}" olarak ayarlandı.` };
      }
      return { success: false, error: `Bilinmeyen eylem: ${action}` };
    },
  });

  useAgentSkill({
    name: 'dashboard-overview-skill',
    description: 'Dashboard KPI ve genel mağaza performansını inceleme kılavuzu',
    applicableRoutes: ['/dashboard'],
    applicableComponents: ['dashboard_kpi'],
    instructions: `
- Dashboard ekranındayken genel ciro, mağaza sayısı ve bekleyen siparişleri özetleyebilirsin.
- 'REFRESH_DATA' ile verileri tazeleyebilir, 'FILTER_REGION' ile bölgeyi filtreleyebilirsin.
- Kullanıcı detaylı satış raporu veya filtre formu isterse 'app_router' bileşenine action='NAVIGATE', payload={ path: '/reports' } gönder.
`,
  });

  const kpis = [
    { title: 'Toplam Ciro', value: '₺1.420.500', change: '+%14,2', bg: '#eff6ff', color: '#1d4ed8' },
    { title: 'Aktif Mağazalar', value: '18 Şube', change: 'Kadıköy lider', bg: '#f0fdf4', color: '#15803d' },
    { title: 'Bekleyen Sipariş', value: '43 Adet', change: '8 kargo bekliyor', bg: '#fefce8', color: '#a16207' },
    { title: 'Aktif Bölge', value: selectedRegion, change: `Son yenileme: ${lastRefreshed}`, bg: '#faf5ff', color: '#7e22ce' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Üst Bilgi ve Hızlı Aksiyon */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>📈 Yönetici Dashboard Özeti (/dashboard)</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Tüm şubeler ve performans metrikleri canlı takip paneli</div>
        </div>
        <button
          onClick={onNavigateToReports}
          style={{
            padding: '8px 14px',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          📊 Satış Raporları Sayfasına Geç ↗
        </button>
      </div>

      {/* KPI Kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {kpis.map((kpi) => (
          <div
            key={kpi.title}
            style={{
              background: kpi.bg,
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{kpi.title}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color, marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{kpi.change}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
