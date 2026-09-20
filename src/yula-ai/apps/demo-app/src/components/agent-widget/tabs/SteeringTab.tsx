import React, { useState } from 'react';

interface SteeringTabProps {
  onSteer: (msg: string) => void;
  onFollowUp: (msg: string) => void;
  steeringQueueLength?: number;
  followUpQueueLength?: number;
}

export function SteeringTab({
  onSteer,
  onFollowUp,
  steeringQueueLength,
  followUpQueueLength,
}: SteeringTabProps) {
  const [steeringText, setSteeringText] = useState('');
  const [followUpText, setFollowUpText] = useState('');

  const handleSendSteer = () => {
    if (steeringText.trim()) {
      onSteer(steeringText.trim());
      setSteeringText('');
    }
  };

  const handleSendFollowUp = () => {
    if (followUpText.trim()) {
      onFollowUp(followUpText.trim());
      setFollowUpText('');
    }
  };

  return (
    <div style={{ flex: 1, padding: 14, overflowY: 'auto', backgroundColor: '#f8fafc', fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
        ⚡ Pi Steering (Anlık Araya Girme)
      </div>
      <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 10px' }}>
        Agent işlem yürütürken araya girip yönünü değiştirin:
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <input
          value={steeringText}
          onChange={(e) => setSteeringText(e.target.value)}
          placeholder="Örn: Dur, Kadıköy yerine Beşiktaş'ı seç!"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
        />
        <button
          onClick={handleSendSteer}
          style={{ padding: '8px 14px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
        >
          Araya Gir (Steer)
        </button>
      </div>

      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
        📥 Pi Follow-up (Takip Görevi Kuyruğu)
      </div>
      <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 10px' }}>
        Agent mevcut işini bitirdikten sonra sıradaki işi otomatik devralsın:
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <input
          value={followUpText}
          onChange={(e) => setFollowUpText(e.target.value)}
          placeholder="Örn: Rapor bitince sonuçları CSV olarak indir."
          style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
        />
        <button
          onClick={handleSendFollowUp}
          style={{ padding: '8px 14px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
        >
          Kuyruğa Ekle
        </button>
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
        <div style={{ fontWeight: 600, color: '#334155', marginBottom: 6 }}>
          ⚡ Pi Reaktif Döngü Modu:
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          • Steering: Model araç çalıştırırken tur sınırında anında devreye girer.<br />
          • Follow-up: Model boşta kaldığında sıradaki iş otomatik yürütülür.
          {typeof steeringQueueLength === 'number' && (
            <div style={{ marginTop: 4 }}>• Bekleyen Kuyruk: {steeringQueueLength} steer, {followUpQueueLength ?? 0} follow-up</div>
          )}
        </div>
      </div>
    </div>
  );
}
