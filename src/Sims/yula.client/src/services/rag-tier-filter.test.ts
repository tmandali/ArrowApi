/**
 * Node built-in test runner: npx tsx --test src/services/rag-tier-filter.test.ts
 * Katmanlı RAG arama filtresi (saf SQL builder).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRagWhereClause } from "../lib/rag-tier.ts";

describe("buildRagWhereClause", () => {
  it("returns empty string without filter", () => {
    assert.equal(buildRagWhereClause({}), "");
  });

  it("restricts workspace tier to the active workspace", () => {
    assert.equal(
      buildRagWhereClause({ workspace: "stock" }),
      "WHERE (tier <> 'workspace' OR workspace = 'stock')",
    );
  });

  it("combines tier list with workspace", () => {
    assert.equal(
      buildRagWhereClause({ workspace: "selling", tiers: ["workspace", "global"] }),
      "WHERE tier IN ('workspace', 'global') AND (tier <> 'workspace' OR workspace = 'selling')",
    );
  });

  it("escapes single quotes in workspace", () => {
    assert.equal(
      buildRagWhereClause({ workspace: "a'b" }),
      "WHERE (tier <> 'workspace' OR workspace = 'a''b')",
    );
  });
});
