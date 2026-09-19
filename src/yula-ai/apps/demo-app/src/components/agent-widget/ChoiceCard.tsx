import React, { useState } from 'react';
import type { UserChoiceOption } from '@my-agent/core';

export interface ChoiceCardProps {
  question: string;
  options: Array<string | UserChoiceOption>;
  allowCustom?: boolean;
  onSelectOption: (option: UserChoiceOption) => void;
  disabled?: boolean;
}

export function ChoiceCard({
  question,
  options,
  allowCustom = true,
  onSelectOption,
  disabled = false,
}: ChoiceCardProps) {
  const [selectedVal, setSelectedVal] = useState<string | null>(null);

  const normalizedOptions: UserChoiceOption[] = options.map((opt) =>
    typeof opt === 'string'
      ? { label: opt, value: opt }
      : { label: opt.label, value: opt.value || opt.label, description: opt.description }
  );

  const handleSelect = (opt: UserChoiceOption) => {
    if (disabled || selectedVal) return;
    setSelectedVal(opt.value || opt.label);
    onSelectOption(opt);
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 12px',
        borderRadius: 10,
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Soru Başlığı */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#38bdf8' }}>
        <span>🎯</span>
        <span>{question}</span>
      </div>

      {/* Seçenek Butonları */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {normalizedOptions.map((opt, i) => {
          const val = opt.value || opt.label;
          const isSelected = selectedVal === val;
          const isOtherSelected = Boolean(selectedVal && !isSelected);

          return (
            <button
              key={`${val}_${i}`}
              type="button"
              disabled={disabled || Boolean(selectedVal)}
              onClick={() => handleSelect(opt)}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: disabled || selectedVal ? 'default' : 'pointer',
                border: isSelected ? '1px solid #38bdf8' : '1px solid #334155',
                backgroundColor: isSelected ? '#1e3a8a' : isOtherSelected ? '#1e293b' : '#1e293b',
                color: isSelected ? '#ffffff' : isOtherSelected ? '#64748b' : '#f8fafc',
                opacity: isOtherSelected ? 0.6 : 1,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!disabled && !selectedVal) {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                  e.currentTarget.style.borderColor = '#60a5fa';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !selectedVal) {
                  e.currentTarget.style.backgroundColor = '#1e293b';
                  e.currentTarget.style.borderColor = '#334155';
                  e.currentTarget.style.color = '#f8fafc';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{opt.label}</span>
                {isSelected && <span style={{ color: '#4ade80', fontSize: 11 }}>✓</span>}
              </div>
              {opt.description && (
                <span style={{ fontSize: 10, color: isSelected ? '#93c5fd' : '#94a3b8', fontWeight: 400, marginTop: 2 }}>
                  {opt.description}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {allowCustom && !selectedVal && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          💡 İsterseniz aşağıdaki kutudan farklı bir cevap da yazabilirsiniz.
        </div>
      )}
    </div>
  );
}
