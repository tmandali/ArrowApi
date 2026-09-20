import { duckDbClient } from "../../../services/duckdb/duckdb-client"
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
 * Bridges DuckDB WASM data with Pyodide Python execution.
 * Extracts tabular data from DuckDB, formats it for Pyodide,
 * and executes Python calculations in the isolated Web Worker.
 */
export async function runPythonOnDuckDbTable(
  options: TableSkillAnalysisOptions
): Promise<string> {
  const {
    tableName,
    pythonCode,
    skillName = "DuckDB-Python-Analysis",
    filters,
    limit = 50_000,
    ...restOptions
  } = options

  // 1. Query rows from DuckDB WASM
  const queryResult = await duckDbClient.queryReportRows({
    tableName,
    filters,
    limit,
  })

  const rows = queryResult.rows || []

  // 2. Wrap pythonCode with automated DataFrame preparation
  const wrappedCode = `
import pandas as pd
import json

# Auto-injected DuckDB records
if 'duckdb_rows' in globals() and duckdb_rows:
    df = pd.DataFrame(duckdb_rows)
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
      duckdb_rows: rows,
      ...(restOptions.variables || {}),
    },
  })

  return executionId
}
