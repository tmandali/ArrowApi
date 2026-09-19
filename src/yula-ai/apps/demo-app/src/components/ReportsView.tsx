import React from 'react';
import { CriteriaForm } from './CriteriaForm';
import { DynamicResultGrid } from './DynamicResultGrid';

export interface ReportsViewProps {
  stage: 'CRITERIA' | 'RESULT';
  storeId: string;
  dateRange: string;
  validationError: string | null;
  onStoreIdChange: (storeId: string) => void;
  onDateRangeChange: (dateRange: string) => void;
  onSubmit: () => void;
  onBackToCriteria: () => void;
  onLog: (msg: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  stage,
  storeId,
  dateRange,
  validationError,
  onStoreIdChange,
  onDateRangeChange,
  onSubmit,
  onBackToCriteria,
  onLog,
}) => {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      <div
        style={{
          background: '#162238',
          border: '1px solid #233352',
          borderRadius: 14,
          padding: 20,
          maxWidth: 960,
          margin: '0 auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #233352',
            paddingBottom: 12,
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📊</span> Satış & Stok Raporu Modülü
          </h2>
          <span
            style={{
              fontSize: 12,
              backgroundColor: stage === 'CRITERIA' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: stage === 'CRITERIA' ? '#60a5fa' : '#34d399',
              padding: '4px 10px',
              borderRadius: 12,
              fontWeight: 600,
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}
          >
            {stage === 'CRITERIA' ? '1. Aşama: Kriter Formu' : '2. Aşama: Sonuç Tablosu'}
          </span>
        </div>

        {stage === 'CRITERIA' ? (
          <CriteriaForm
            storeId={storeId}
            dateRange={dateRange}
            onStoreIdChange={onStoreIdChange}
            onDateRangeChange={onDateRangeChange}
            onSubmit={onSubmit}
            validationError={validationError}
          />
        ) : (
          <DynamicResultGrid
            storeId={storeId}
            onBack={onBackToCriteria}
            onLog={onLog}
          />
        )}
      </div>
    </div>
  );
};
