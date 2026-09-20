import { loadPyodide, type PyodideInterface } from "pyodide"
import type { SkillWorkerRequest, SkillWorkerResponse } from "../../features/skills/types"

let pyodide: PyodideInterface | null = null
let isInitializing = false
let currentExecutionId: string | null = null
const readyPackages = new Set<string>()

function postResponse(msg: SkillWorkerResponse, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) {
    self.postMessage(msg, { transfer })
  } else {
    self.postMessage(msg)
  }
}

async function initPyodide(baseUrl = "/pyodide/"): Promise<PyodideInterface> {
  if (pyodide) return pyodide
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (pyodide) return pyodide
  }

  isInitializing = true
  try {
    const instance = await loadPyodide({
      indexURL: baseUrl,
      stdout: (text: string) => {
        if (currentExecutionId) {
          postResponse({
            type: "STDOUT",
            executionId: currentExecutionId,
            text,
          })
        }
      },
      stderr: (text: string) => {
        if (currentExecutionId) {
          postResponse({
            type: "STDERR",
            executionId: currentExecutionId,
            text,
          })
        }
      },
    })

    // Setup base packages: pandas and openpyxl
    try {
      await instance.loadPackage(["pandas"])
      readyPackages.add("pandas")
      readyPackages.add("numpy")
    } catch (err) {
      console.warn("[Pyodide Worker] Pandas load warning:", err)
    }

    try {
      await instance.loadPackage("micropip")
      const micropip = instance.pyimport("micropip")
      await micropip.install("openpyxl")
      readyPackages.add("openpyxl")
    } catch (err) {
      console.warn("[Pyodide Worker] openpyxl load warning:", err)
    }

    pyodide = instance
    postResponse({
      type: "INIT_DONE",
      readyPackages: Array.from(readyPackages),
    })
    return pyodide
  } finally {
    isInitializing = false
  }
}

self.onmessage = async (event: MessageEvent<SkillWorkerRequest>) => {
  const data = event.data

  if (data.action === "INIT") {
    try {
      await initPyodide(data.basePyodideUrl)
    } catch (err: any) {
      postResponse({
        type: "ERROR",
        executionId: "system",
        error: `Pyodide init failed: ${err?.message || String(err)}`,
      })
    }
    return
  }

  if (data.action === "ABORT") {
    if (currentExecutionId === data.executionId) {
      currentExecutionId = null
    }
    return
  }

  if (data.action === "RUN") {
    const { executionId, code, packages, variables, arrowBuffer } = data
    currentExecutionId = executionId

    try {
      const py = await initPyodide()

      // Load dynamically requested packages if any
      if (packages && packages.length > 0) {
        const toLoad = packages.filter((p) => !readyPackages.has(p))
        if (toLoad.length > 0) {
          try {
            await py.loadPackage(toLoad)
            toLoad.forEach((p) => readyPackages.add(p))
          } catch {
            const micropip = py.pyimport("micropip")
            for (const pkg of toLoad) {
              await micropip.install(pkg)
              readyPackages.add(pkg)
            }
          }
        }
      }

      // Inject arrow data if provided
      if (arrowBuffer && arrowBuffer.byteLength > 0) {
        py.globals.set("__arrow_bytes__", arrowBuffer)
        await py.runPythonAsync(`
import io
try:
    import pyarrow as pa
    reader = pa.ipc.open_stream(io.BytesIO(bytes(__arrow_bytes__)))
    arrow_table = reader.read_all()
    df = arrow_table.to_pandas()
except Exception:
    pass
`)
      }

      // Inject custom runtime variables
      if (variables) {
        for (const [key, val] of Object.entries(variables)) {
          py.globals.set(key, val)
        }
      }

      // Run code asynchronously
      const rawResult = await py.runPythonAsync(code)

      let result: unknown = null
      if (rawResult !== undefined && rawResult !== null) {
        if (typeof rawResult.toJs === "function") {
          result = rawResult.toJs({ dict_converter: Object.fromEntries })
        } else {
          result = rawResult
        }
        if (typeof rawResult.destroy === "function") {
          rawResult.destroy()
        }
      }

      postResponse({
        type: "RESULT",
        executionId,
        result,
      })
    } catch (err: any) {
      postResponse({
        type: "ERROR",
        executionId,
        error: err?.message || String(err),
      })
    } finally {
      if (currentExecutionId === executionId) {
        currentExecutionId = null
      }
    }
  }
}
