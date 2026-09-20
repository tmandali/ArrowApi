import React from 'react';

export interface NavigationTabsProps {
  currentRoute: string;
  onNavigate?: (route: string) => void;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({ currentRoute, onNavigate }) => {
  const tabs = [
    { route: '/reports', label: '📊 Raporlar & Form' },
    { route: '/dashboard', label: '📈 Dashboard' },
    { route: '/tests', label: '🧪 Pi Simülasyon Testleri' },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {tabs.map((tab) => {
        const isActive = currentRoute === tab.route;
        return (
          <button
            key={tab.route}
            type="button"
            onClick={() => onNavigate?.(tab.route)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: isActive ? '1px solid #3b82f6' : '1px solid #334155',
              backgroundColor: isActive ? '#1e3a8a' : '#1e293b',
              color: isActive ? '#ffffff' : '#94a3b8',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
