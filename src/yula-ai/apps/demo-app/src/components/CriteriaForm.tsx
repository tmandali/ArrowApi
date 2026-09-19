import React from 'react';

interface CriteriaFormProps {
  storeId: string;
  dateRange: string;
  onStoreIdChange: (value: string) => void;
  onDateRangeChange: (value: string) => void;
  onSubmit: () => void;
  validationError: string | null;
}

export function CriteriaForm({
  storeId,
  dateRange,
  onStoreIdChange,
  onDateRangeChange,
  onSubmit,
  validationError,
}: CriteriaFormProps) {
  return (
    <div>
      {validationError && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>⚠️</span>
          <span>{validationError}</span>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
          Mağaza:
        </label>
        <input
          value={storeId}
          onChange={(e) => onStoreIdChange(e.target.value)}
          placeholder="Örn: Kadıköy"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
          Tarih Aralığı:
        </label>
        <input
          value={dateRange}
          onChange={(e) => onDateRangeChange(e.target.value)}
          placeholder="Örn: 2026-09"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
      </div>

      <button
        onClick={onSubmit}
        style={{
          backgroundColor: '#2563eb',
          color: '#ffffff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 20px',
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        Raporu Getir
      </button>
    </div>
  );
}
