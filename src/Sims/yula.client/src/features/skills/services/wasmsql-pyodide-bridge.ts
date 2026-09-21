import { wasmSqlClient } from "../../../services/wasmsql"
import { skillEventHub } from "./skill-event-hub"
import type { SkillRunOptions } from "../types"

export interface TableSkillAnalysisOptions extends SkillRunOptions {
  tableName: string
  pythonCode: string
  skillName?: string
  filters?: Record<string, string>
  limit?: number
}

/**
 * Bridges WasmSQL data with Pyodide Python execution.
 * Extracts tabular data from WasmSQL, formats it for Pyodide,
 * and executes Python calculations in the isolated Web Worker.
 */
export async function runPythonOnWasmSqlTable(
  options: TableSkillAnalysisOptions
): Promise<string> {
  const {
    tableName,
    pythonCode,
    skillName = "WasmSQL-Python-Analysis",
    filters,
    limit = 50_000,
    ...restOptions
  } = options

  // 1. Query rows from WasmSQL
  const queryResult = await wasmSqlClient.queryReportRows({
    tableName,
    filters,
    limit,
  })

  const rows = queryResult.rows || []

  // 2. Wrap pythonCode with automated DataFrame preparation
  const wrappedCode = `
import pandas as pd
import json

# Auto-injected WasmSQL / DuckDB records
_raw_rows = globals().get('wasmsql_rows') or globals().get('duckdb_rows') or []
if _raw_rows:
    df = pd.DataFrame(_raw_rows)
else:
    df = pd.DataFrame()

# User/Skill Analysis Logic
${pythonCode}
`

  // 3. Dispatch through SkillEventHub
  const executionId = skillEventHub.dispatchRun(skillName, wrappedCode, {
    ...restOptions,
    packages: Array.from(
      new Set(["pandas", ...(restOptions.packages || [])])
    ),
    variables: {
      wasmsql_rows: rows,
      duckdb_rows: rows,
      ...(restOptions.variables || {}),
    },
  })

  return executionId
}
