import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveRouteCategory,
  isAiAllowedOnRoute,
} from "./screen-contract";
import {
  AgentEditorContract,
  SwitchTabInputSchema,
  SelectAgentInputSchema,
} from "@/features/system/components/agents/agent-editor.contract";
import { SkillEditorContract } from "@/features/system/components/agents/skill-editor.contract";
import { PluginsRegistryContract } from "@/workspaces/my/components/studio/plugins-registry.contract";
import { MemoryManagementContract } from "@/workspaces/my/components/studio/memory-management.contract";
import { PlaybooksManagementContract } from "@/workspaces/my/components/playbooks/playbook-management.contract";
import { UserSettingsContract } from "@/workspaces/my/components/settings/user-settings.contract";

describe("ScreenContract & Gatekeeper Category Resolver", () => {
  it("auth ve oturum rotaları 'restricted' kategorisine girer", () => {
    assert.equal(resolveRouteCategory("/sign-in"), "restricted");
    assert.equal(resolveRouteCategory("/(auth)/sign-in"), "restricted");
    assert.equal(resolveRouteCategory("/(auth)/sign-up"), "restricted");
    assert.equal(resolveRouteCategory("/(auth)/forgot-password"), "restricted");
    assert.equal(resolveRouteCategory("/login"), "restricted");
    assert.equal(isAiAllowedOnRoute("/sign-in"), false);
    assert.equal(isAiAllowedOnRoute("/(auth)/sign-in"), false);
  });

  it("DuckDB ve rapor rotaları 'report_results' kategorisine girer", () => {
    assert.equal(resolveRouteCategory("/stock/retail-sales-report"), "report_results");
    assert.equal(resolveRouteCategory("/stock/stock-balance/job-123"), "report_results");
    assert.equal(resolveRouteCategory("/stock/stock-analytics"), "report_results");
    assert.equal(isAiAllowedOnRoute("/stock/retail-sales-report"), true);
  });

  it("yönetim ve interaktif sayfalar 'interactive_operator' kategorisine girer", () => {
    assert.equal(resolveRouteCategory("/my/agents"), "interactive_operator");
    assert.equal(resolveRouteCategory("/my/skills"), "interactive_operator");
    assert.equal(resolveRouteCategory("/my/plugins"), "interactive_operator");
    assert.equal(resolveRouteCategory("/my/memory"), "interactive_operator");
    assert.equal(resolveRouteCategory("/my/playbooks"), "interactive_operator");
    assert.equal(resolveRouteCategory("/my/settings"), "interactive_operator");
    assert.equal(resolveRouteCategory("/system/users"), "interactive_operator");
    assert.equal(resolveRouteCategory("/stock/item"), "interactive_operator");
    assert.equal(isAiAllowedOnRoute("/my/agents"), true);
  });

  it("modül kökleri ve dashboard sayfaları 'workspace_hub' kategorisine girer", () => {
    assert.equal(resolveRouteCategory("/"), "workspace_hub");
    assert.equal(resolveRouteCategory("/stock"), "workspace_hub");
    assert.equal(resolveRouteCategory("/accounting"), "workspace_hub");
    assert.equal(resolveRouteCategory("/selling"), "workspace_hub");
    assert.equal(isAiAllowedOnRoute("/stock"), true);
  });
});

describe("Management Screen Contracts Validation", () => {
  it("AgentEditorContract Zod action validation", () => {
    assert.equal(AgentEditorContract.screenId, "entity_form:agent_editor");
    assert.equal(AgentEditorContract.category, "interactive_operator");
    assert.equal(AgentEditorContract.aiEnabled, true);

    const actions = Object.keys(AgentEditorContract.actions);
    assert.ok(actions.includes("READ"));
    assert.ok(actions.includes("SELECT_AGENT"));
    assert.ok(actions.includes("SWITCH_TAB"));
    assert.ok(actions.includes("SET_ACTIVE"));
    assert.ok(actions.includes("TEST_AGENT"));
    assert.ok(actions.includes("SAVE"));

    const valid = SwitchTabInputSchema.safeParse({ tab: "genel" });
    assert.equal(valid.success, true);
    const invalid = SwitchTabInputSchema.safeParse({ tab: "unknown" });
    assert.equal(invalid.success, false);
    const byId = SelectAgentInputSchema.safeParse({ id: "agent-1" });
    assert.equal(byId.success, true);
  });

  it("SkillEditorContract aksiyonlarını eksiksiz barındırır", () => {
    assert.equal(SkillEditorContract.screenId, "entity_form:skill_editor");
    assert.equal(SkillEditorContract.category, "interactive_operator");
    assert.equal(SkillEditorContract.aiEnabled, true);

    const actions = Object.keys(SkillEditorContract.actions);
    assert.ok(actions.includes("READ"));
    assert.ok(actions.includes("SELECT_SKILL"));
    assert.ok(actions.includes("SWITCH_TAB"));
    assert.ok(actions.includes("TEST_SKILL"));
    assert.ok(actions.includes("SAVE"));
  });

  it("PluginsRegistryContract aksiyonlarını eksiksiz barındırır", () => {
    assert.equal(PluginsRegistryContract.screenId, "entity_form:plugin_registry");
    assert.equal(PluginsRegistryContract.category, "interactive_operator");
    assert.equal(PluginsRegistryContract.aiEnabled, true);
    assert.ok("READ" in PluginsRegistryContract.actions);
  });

  it("MemoryManagementContract aksiyonlarını eksiksiz barındırır", () => {
    assert.equal(MemoryManagementContract.screenId, "entity_form:agent_memory");
    assert.equal(MemoryManagementContract.category, "interactive_operator");
    assert.equal(MemoryManagementContract.aiEnabled, true);

    const actions = Object.keys(MemoryManagementContract.actions);
    assert.ok(actions.includes("READ"));
    assert.ok(actions.includes("FORGET"));
    assert.ok(actions.includes("CLEAR_ALL"));
  });

  it("PlaybooksManagementContract aksiyonlarını eksiksiz barındırır", () => {
    assert.equal(PlaybooksManagementContract.screenId, "entity_form:playbook_manager");
    assert.equal(PlaybooksManagementContract.category, "interactive_operator");
    assert.equal(PlaybooksManagementContract.aiEnabled, true);

    const actions = Object.keys(PlaybooksManagementContract.actions);
    assert.ok(actions.includes("READ"));
    assert.ok(actions.includes("SEARCH"));
    assert.ok(actions.includes("SELECT_WORKFLOW"));
    assert.ok(actions.includes("SWITCH_VIEW"));
    assert.ok(actions.includes("DELETE_RULE"));
    assert.ok(actions.includes("REFRESH"));
  });

  it("UserSettingsContract aksiyonlarını eksiksiz barındırır", () => {
    assert.equal(UserSettingsContract.screenId, "entity_form:user_settings");
    assert.equal(UserSettingsContract.category, "interactive_operator");
    assert.equal(UserSettingsContract.aiEnabled, true);

    const actions = Object.keys(UserSettingsContract.actions);
    assert.ok(actions.includes("READ"));
    assert.ok(actions.includes("SWITCH_TAB"));
    assert.ok(actions.includes("SET_AI_CONFIG"));
  });
});
