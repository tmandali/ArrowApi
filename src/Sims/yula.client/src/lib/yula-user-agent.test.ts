/**
 * Node built-in test runner: npx tsx --test src/lib/yula-user-agent.test.ts
 * Ajan validasyon + kapsam + araç kapısı (saf).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
