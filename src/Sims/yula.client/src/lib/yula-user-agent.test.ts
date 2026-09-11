/**
 * Node built-in test runner: npx tsx --test src/lib/yula-user-agent.test.ts
 * Ajan validasyon + kapsam + araç kapısı (saf).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentScopeWorkspaceId,
  filterActiveToolsByAgent,
  filterAgentsByScope,
  validateUserAgent,
} from "./yula-user-agent.ts";

describe("validateUserAgent", () => {
  it("accepts a well-formed draft", () => {
    assert.equal(
      validateUserAgent(
        { name: "Muhasebe Uzmanı", instructions: "Kısa yaz." },
        [],
      ),
      null,
    );
  });
  it("rejects empty name, duplicates, empty instructions", () => {
    assert.ok(validateUserAgent({ name: "", instructions: "X" }, []));
    assert.ok(
      validateUserAgent({ name: "Stokçu", instructions: "X" }, ["stokçu"]),
    );
    assert.ok(validateUserAgent({ name: "Stokçu", instructions: "  " }, []));
  });
});

describe("filterAgentsByScope", () => {
  const base = {
    id: "1", description: "", instructions: "X",
    tools: [], skills: [], createdAt: 0, updatedAt: 0,
  };
  const agents = [
    { ...base, id: "g", name: "Genel" },
    { ...base, id: "s", name: "Stokçu", scope: "stock" },
  ];
  it("shows global + matching agents", () => {
    assert.deepEqual(
      filterAgentsByScope(agents, "stock").map((a) => a.name),
      ["Genel", "Stokçu"],
    );
  });
  it("shows only global without workspace", () => {
    assert.deepEqual(
      filterAgentsByScope(agents, null).map((a) => a.name),
      ["Genel"],
    );
  });
  it("returns none on system workspace", () => {
    assert.deepEqual(filterAgentsByScope(agents, "system"), []);
  });
});

describe("agentScopeWorkspaceId", () => {
  it("returns null on home so global agents apply", () => {
    assert.equal(agentScopeWorkspaceId("/"), null);
  });
  it("returns system for management pages", () => {
    assert.equal(agentScopeWorkspaceId("/system/skills"), "system");
    assert.equal(agentScopeWorkspaceId("/system/agents"), "system");
  });
  it("returns the work workspace elsewhere", () => {
    assert.equal(agentScopeWorkspaceId("/stock/item"), "stock");
  });
});

describe("filterActiveToolsByAgent", () => {
  const phase = ["run_job", "apply_criteria", "set_grid_query", "run_expert_sql"];
  const grid = ["set_grid_query", "run_expert_sql"];
  it("passes everything when allowlist is empty", () => {
    assert.deepEqual(filterActiveToolsByAgent(phase, grid, []), phase);
    assert.deepEqual(filterActiveToolsByAgent(phase, grid, undefined), phase);
  });
  it("keeps listed tools plus grid group via token", () => {
    assert.deepEqual(
      filterActiveToolsByAgent(phase, grid, ["run_job", "grid-tools"]),
      ["run_job", "set_grid_query", "run_expert_sql"],
    );
  });
  it("drops unlisted tools without the token", () => {
    assert.deepEqual(filterActiveToolsByAgent(phase, grid, ["run_job"]), [
      "run_job",
    ]);
  });
});

describe("lintAgentInstructions", () => {
  it("flags approval bypass, tool ban, single-language impositions", async () => {
    const { lintAgentInstructions, AGENT_LINT_SAMPLES } = await import("./yula-user-agent.ts");
    assert.equal(lintAgentInstructions(AGENT_LINT_SAMPLES.clean).length, 0);
    assert.ok(lintAgentInstructions(AGENT_LINT_SAMPLES.approvalBypass).length > 0);
    assert.ok(lintAgentInstructions(AGENT_LINT_SAMPLES.toolBan).length > 0);
    assert.ok(lintAgentInstructions(AGENT_LINT_SAMPLES.singleLanguage).length > 0);
  });
  it("does not flag prohibitive negation (sormadan çalıştırma = önce sor)", async () => {
    const { lintAgentInstructions } = await import("./yula-user-agent.ts");
    assert.equal(
      lintAgentInstructions("Emin olmadığın filtreyi sormadan çalıştırma; önce sor.").length,
      0,
    );
    assert.ok(
      lintAgentInstructions("Kullanıcıya sormadan çalıştır.").length > 0,
    );
  });
});
