import { pluginRegistry, type AgentPlugin } from "@my-agent/core";

/**
 * Örnek Kurumsal Eklenti: Stok Tahminleme ve Talep Projeksiyonu
 */
export const stockPredictiveAnalyticsPlugin: AgentPlugin = {
  id: "stock_predictive_analytics",
  name: "Stok Tahminleme & Trend Analiz Eklentisi",
  version: "1.0.0",
  description: "Geçmiş 3 aylık satış hareketlerini analiz ederek gelecek ayın stok talebini tahminleme yeteneği.",
  skills: [
    {
      name: "stock-demand-forecasting",
      description: "Gelecek dönem stok ihtiyacını ve tükenme riskini tahmin eder.",
      instructions: "Kullanıcı stok tahmini, tükenme riski veya sipariş önerisi sorduğunda son satış hareketleri ve ortalama günlük çıkışları baz al.",
    },
  ],
  tools: {
    forecast_stock_demand: {
      description: "Belirtilen ürün grubu veya depo için gelecek 30 günlük talep tahminini döner.",
      execute: async (params: { storeId?: string; itemCategory?: string }) => {
        return {
          success: true,
          storeId: params.storeId || "Kadıköy",
          forecastDays: 30,
          expectedDemandGrowth: "+8.4%",
          recommendedSafetyStockBuffer: "12%",
          message: `${params.storeId || "Tüm mağazalar"} için 30 günlük projeksiyon başarıyla hesaplandı.`,
        };
      },
    },
  },
};

/**
 * Yula varsayılan eklentilerini başlatır ve pluginRegistry'ye kaydeder.
 */
export async function registerDefaultYulaPlugins(): Promise<void> {
  if (pluginRegistry.has(stockPredictiveAnalyticsPlugin.id)) return;
  await pluginRegistry.register(stockPredictiveAnalyticsPlugin);
}

export { pluginRegistry, type AgentPlugin };
