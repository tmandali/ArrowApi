import type { Skill } from '@my-agent/core';

/**
 * Demo ERP Satış & Stok Raporu Becerisi (Demo Application Scope)
 */
export const salesReportSkill: Skill = {
  name: 'sales-report-workflow',
  description: 'Satış & Stok Raporu oluşturma ve kriter belirleme kılavuzu',
  applicableComponents: ['filter_form'],
  applicableRoutes: ['/reports'],
  riskLevel: 'medium',
  requiresApproval: true,
  requiredFields: ['storeId', 'dateRange'],
  instructions: `
- Raporu oluşturmak için 'filter_form' bileşenine SET_FIELDS komutu ile storeId (örn: Kadıköy) ve dateRange (örn: 2026-09) alanlarını gönder.
- Ardından SUBMIT aksiyonunu çağırarak raporu oluştur.
- Her iki alan da zorunludur; biri eksikse asla SUBMIT çağırma.
`,
};
