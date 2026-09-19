import React from 'react';

export interface PendingApproval {
  component_id: string;
  action: string;
  payload?: any;
  resolve: (approved: boolean) => void;
}

export function HitlModal({ pendingApproval }: { pendingApproval: PendingApproval }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          padding: 24,
          maxWidth: 440,
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          border: '2px solid #f59e0b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🛡️</span>
          <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Human-in-the-Loop Onayı</h3>
        </div>
        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
          Ajan <strong>"{pendingApproval.component_id}"</strong> bileşeninde{' '}
          <span style={{ backgroundColor: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
            {pendingApproval.action}
          </span>{' '}
          aksiyonunu çalıştırmak üzere onayınızı talep ediyor.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={() => pendingApproval.resolve(false)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#f1f5f9',
              color: '#475569',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Reddet (Engelle)
          </button>
          <button
            onClick={() => pendingApproval.resolve(true)}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Onayla ve İlerlet
          </button>
        </div>
      </div>
    </div>
  );
}
