import { z } from "zod";
import { defineScreenContract } from "./screen-contract";

export const HubNavigateInputSchema = z.object({
  path: z.string(),
});

const commonHubActions = {
  NAVIGATE: {
    description: "Navigates to a sub-report, list, or entity screen within this workspace ({ path: string }).",
    inputSchema: HubNavigateInputSchema,
    whenToCall: "When the user commands to open or go to a report or view in this module.",
    whenNotToCall: "When already on the requested screen.",
  },
  READ_SUMMARY: {
    description: "Reads the module overview, available reports, and operational summary.",
    whenToCall: "When the user asks what can be done in this module or asks for a summary of capabilities.",
    whenNotToCall: "When performing an action on a specific sub-screen.",
  },
};

export const RootWorkspaceHubContract = defineScreenContract({
  screenId: "hub:root",
  screenTitle: "Yula ERP Ana Menü",
  workspace: "root",
  category: "workspace_hub",
  aiEnabled: true,
  actions: commonHubActions,
});

export const StockWorkspaceHubContract = defineScreenContract({
  screenId: "hub:stock",
  screenTitle: "Stok Modülü",
  workspace: "stock",
  category: "workspace_hub",
  aiEnabled: true,
  actions: commonHubActions,
});

export const AccountingWorkspaceHubContract = defineScreenContract({
  screenId: "hub:accounting",
  screenTitle: "Muhasebe Modülü",
  workspace: "accounting",
  category: "workspace_hub",
  aiEnabled: true,
  actions: commonHubActions,
});

export const SellingWorkspaceHubContract = defineScreenContract({
  screenId: "hub:selling",
  screenTitle: "Satış & Müşteri Modülü",
  workspace: "selling",
  category: "workspace_hub",
  aiEnabled: true,
  actions: commonHubActions,
});

export const ManufacturingWorkspaceHubContract = defineScreenContract({
  screenId: "hub:manufacturing",
  screenTitle: "Üretim Modülü",
  workspace: "manufacturing",
  category: "workspace_hub",
  aiEnabled: true,
  actions: commonHubActions,
});

export const SubcontractingWorkspaceHubContract = defineScreenContract({
  screenId: "hub:subcontracting",
  screenTitle: "Fason & Tedarik Modülü",
  workspace: "subcontracting",
  category: "workspace_hub",
  aiEnabled: true,
  actions: commonHubActions,
});

export const FinancialReportsHubContract = defineScreenContract({
  screenId: "hub:financial_reports",
  screenTitle: "Finansal Raporlar",
  workspace: "accounting",
  category: "workspace_hub",
  aiEnabled: true,
  actions: commonHubActions,
});
