/**
 * Node built-in test runner:
 *   npx tsx --test src/components/layout/chat-markdown/mermaid.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as React from "react";
import { extractCodeDetails } from "./markdown-component-map.tsx";
import { parseMarkdownBlocks } from "./markdown-entities.ts";
import { MermaidBlock } from "./mermaid-block.tsx";
import { MermaidChip } from "./mermaid-chip.tsx";
import { detectDiagramMeta } from "./mermaid-meta.ts";
import { useActiveDiagramStore } from "../../../lib/stores/active-diagram-store.ts";

describe("Markdown Mermaid Parsing & Integration", () => {
  it("extracts mermaid code block language and text correctly", () => {
    const rawMermaid = "graph TD\n  A[Start] --> B[End]";
    const element = React.createElement(
      "code",
      { className: "language-mermaid" },
      rawMermaid,
    );

    const result = extractCodeDetails(element);
    assert.equal(result.language, "mermaid");
    assert.equal(result.text, rawMermaid);
  });

  it("parses top-level markdown code blocks containing mermaid", () => {
    const markdown = "Here is the workflow:\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\nDone.";
    const blocks = parseMarkdownBlocks(markdown);

    const codeBlock = blocks.find((b) => b.type === "code");
    assert.ok(codeBlock, "Should contain a code block");
    assert.ok(codeBlock.raw.includes("```mermaid"));
    assert.ok(codeBlock.raw.includes("graph TD;"));
  });

  it("exports MermaidBlock and MermaidChip as valid React component functions", () => {
    assert.equal(typeof MermaidBlock, "function");
    assert.equal(typeof MermaidChip, "function");
  });

  it("detects diagram type, title, and line count accurately", () => {
    const seqChart = `%% title: Order Flow
sequenceDiagram
  Client->>Server: Request
  Server-->>Client: Response`;
    const meta1 = detectDiagramMeta(seqChart);
    assert.equal(meta1.type, "Sequence");
    assert.equal(meta1.title, "Order Flow");
    assert.equal(meta1.lineCount, 4);

    const erChart = `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains`;
    const meta2 = detectDiagramMeta(erChart);
    assert.equal(meta2.type, "ERD");
    assert.equal(meta2.title, "ERD Diagram");
    assert.equal(meta2.lineCount, 3);

    const stateChart = `stateDiagram-v2
  [*] --> Still
  Still --> [*]`;
    const meta3 = detectDiagramMeta(stateChart);
    assert.equal(meta3.type, "State");
  });

  it("manages active diagram and maximize state in useActiveDiagramStore", () => {
    const store = useActiveDiagramStore.getState();
    assert.equal(store.isOpen, false);
    assert.equal(store.isMaximized, false);
    assert.equal(store.activeDiagram, null);

    store.openDiagram({
      id: "diag-1",
      chart: "graph TD\n  A-->B",
      title: "Test Flow",
      type: "Flowchart",
    });

    const openState = useActiveDiagramStore.getState();
    assert.equal(openState.isOpen, true);
    assert.equal(openState.isMaximized, false);
    assert.equal(openState.activeDiagram?.id, "diag-1");
    assert.equal(openState.activeDiagram?.title, "Test Flow");

    // Test maximize toggle
    store.toggleMaximize();
    assert.equal(useActiveDiagramStore.getState().isMaximized, true);

    store.toggleMaximize();
    assert.equal(useActiveDiagramStore.getState().isMaximized, false);

    store.setMaximized(true);
    assert.equal(useActiveDiagramStore.getState().isMaximized, true);

    store.closeDiagram();
    const closedState = useActiveDiagramStore.getState();
    assert.equal(closedState.isOpen, false);
    assert.equal(closedState.isMaximized, false);
    assert.equal(closedState.activeDiagram, null);
  });
});
