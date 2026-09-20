---
name: mcp-builder
slash: mcp-builder
label: MCP Sunucu Tasarımı
description: Model Context Protocol (MCP) sunucusu ve araçları tasarlama, entegrasyon ve geliştirme rehberi
scope: global
---

# MCP (Model Context Protocol) Server Development Guide

Guide for creating high-quality Model Context Protocol (MCP) servers that enable LLMs to interact with services through well-designed tools.

## Recommended Stack
- **Language**: TypeScript (`@modelcontextprotocol/sdk`)
- **Transport**: `stdio` for local tools, Streamable HTTP / SSE for remote microservices.
- **Validation**: `zod` for strictly typed input and output schemas.

## Core Design Principles

### 1. Tool Naming and Discoverability
- Use clear, descriptive names with consistent domain prefixes:
  - `sims_query_stock_balance`
  - `sims_trigger_arrow_job`
  - `sims_get_report_schema`
- Ensure parameter names and descriptions explain exact expected formats.

### 2. Context Window Efficiency
- Never return megabytes of raw JSON to the model context.
- Support pagination (`limit`, `offset` or `cursor`).
- Provide summary fields and filter capabilities so the agent can request only what it needs.

### 3. Actionable Error Messages
- Errors must explain what went wrong and how the agent can fix it.
- Example: `"Report 'stk_01' requires parameter 'startDate' in YYYY-MM-DD format, received 'invalid'."`

## TypeScript MCP Server Skeleton

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const server = new Server(
  { name: "sims-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 1. Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_report_sample",
        description: "Returns a 10-row sample from a DuckDB report table.",
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string", description: "Target table name" },
            limit: { type: "number", default: 10 },
          },
          required: ["tableName"],
        },
      },
    ],
  };
});

// 2. Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === "get_report_sample") {
    return {
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
    };
  }
  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```
