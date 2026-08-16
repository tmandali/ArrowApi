import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { toolRegistry } from '../lib/tool-registry';
import { yulaReportCardConfigs } from '@/components/layout/yula-components-data';
import { registerAllReportSchemaTools } from '@/lib/schema-tool-generator';

export interface ReportFilterArgs {
  date_range?: string;
  city?: string;
  [key: string]: any;
}

export interface ReportContextType {
  date_range: string;
  city: string;
  shouldTriggerFetch: boolean;
  lastUpdatedByAI: boolean;
  aiTimestamp: string | null;
  setDateRange: (val: string) => void;
  setCity: (val: string) => void;
  setFiltersFromAI: (args: ReportFilterArgs) => void;
  resetTrigger: () => void;
}

const ReportContext = createContext<ReportContextType | undefined>(undefined);

export const ReportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dateRange, setDateRange] = useState<string>('2026-07-20 - 2026-08-19');
  const [city, setCity] = useState<string>('Ankara');
  const [shouldTriggerFetch, setShouldTriggerFetch] = useState<boolean>(false);
  const [lastUpdatedByAI, setLastUpdatedByAI] = useState<boolean>(false);
  const [aiTimestamp, setAiTimestamp] = useState<string | null>(null);

  // AI modelinden / Sidecar tool_call'dan gelen emirleri işleyen ana fonksiyon
  const setFiltersFromAI = useCallback((args: ReportFilterArgs) => {
    console.log('[ReportContext] AI Tool Call argümanları alındı:', args);
    
    if (args.date_range !== undefined) {
      setDateRange(args.date_range);
    }
    if (args.city !== undefined) {
      setCity(args.city);
    }
    
    // Otomatik rapor sorgulamayı tetikle
    setShouldTriggerFetch(true);
    setLastUpdatedByAI(true);
    setAiTimestamp(new Date().toLocaleTimeString('tr-TR'));
  }, []);

  // 1. Genel filtre güncelleme aracı
  // 2. JSON Schema'lardan türetilen tüm dinamik rapor araçları
  useEffect(() => {
    const unregisterFilters = toolRegistry.register({
      name: 'update_report_filters',
      description: 'Rapor ekranındaki tarih aralığı ve şehir filtrelerini günceller ve veri çekimini tetikler.',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'Filtrelenecek şehir adı (örn: Ankara, İstanbul, İzmir, Bursa, Antalya)',
          },
          date_range: {
            type: 'string',
            description: 'Tarih aralığı (örn: "2026-08-01 - 2026-08-19" veya "2026-08-19")',
          },
        },
        required: ['city'],
      },
      execute: (args) => {
        setFiltersFromAI(args);
        return { status: 'success', appliedFilters: args };
      },
    });

    // Tüm raporların JSON Schema'larını otomatik AI Tool olarak kaydet
    const unregisterSchemaTools = registerAllReportSchemaTools(yulaReportCardConfigs);

    return () => {
      unregisterFilters();
      unregisterSchemaTools();
    };
  }, [setFiltersFromAI]);

  const resetTrigger = useCallback(() => {
    setShouldTriggerFetch(false);
  }, []);

  const value = useMemo(
    () => ({
      date_range: dateRange,
      city,
      shouldTriggerFetch,
      lastUpdatedByAI,
      aiTimestamp,
      setDateRange: (val: string) => {
        setDateRange(val);
        setLastUpdatedByAI(false);
      },
      setCity: (val: string) => {
        setCity(val);
        setLastUpdatedByAI(false);
      },
      setFiltersFromAI,
      resetTrigger,
    }),
    [dateRange, city, shouldTriggerFetch, lastUpdatedByAI, aiTimestamp, setFiltersFromAI, resetTrigger]
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
};

export const useReportContext = (): ReportContextType => {
  const context = useContext(ReportContext);
  if (!context) {
    throw new Error('useReportContext, ReportProvider içerisinde kullanılmalıdır.');
  }
  return context;
};

export default ReportContext;
