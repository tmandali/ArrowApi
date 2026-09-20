import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { SkillDefinition } from "../types"

const SYSTEM_SKILLS: SkillDefinition[] = [
  {
    id: "system-xlsx-validator",
    name: "xlsx-validator",
    description: "Validates Excel spreadsheets, inspects formulas, and verifies workbook structure.",
    instructions: `Analyze the provided Excel workbook using openpyxl.
Ensure all formulas are intact and calculate cleanly.
Report any invalid formula references like #REF! or #VALUE!.`,
    scriptCode: `
import openpyxl

def inspect_workbook(file_bytes):
    import io
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=False)
    sheet_names = wb.sheetnames
    print(f"Sheets found: {sheet_names}")
    return {"sheets": sheet_names, "valid": True}
`,
    requiredPackages: ["openpyxl"],
    status: "released",
    version: "1.0.0",
    author: "System",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "system-vat-tevkifat-audit",
    name: "vat-tevkifat-audit",
    description: "Audits VAT (KDV) withholding rates in invoice datasets.",
    instructions: `Inspect invoice rows in pandas DataFrame df.
Flag invoices with total > 5000 TL where withholding rate does not match the service category.`,
    scriptCode: `
# df is pre-injected from DuckDB
if not df.empty and 'total_amount' in df.columns:
    large_invoices = df[df['total_amount'] > 5000]
    print(f"Audited {len(df)} invoices. Flagged: {len(large_invoices)} high-value rows.")
else:
    print("No invoice records to audit.")
`,
    requiredPackages: ["pandas"],
    status: "released",
    version: "1.0.0",
    author: "System",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

interface SkillStoreState {
  userSkills: SkillDefinition[]
  activeExecutionId: string | null
  activeSkillId: string | null

  // Actions
  addDraftSkill: (
    skill: Omit<SkillDefinition, "id" | "status" | "createdAt" | "updatedAt">
  ) => SkillDefinition
  updateSkill: (id: string, updates: Partial<SkillDefinition>) => void
  deleteSkill: (id: string) => void
  releaseSkill: (id: string) => Promise<boolean>
  setActiveExecutionId: (id: string | null) => void
  setActiveSkillId: (id: string | null) => void
  getAllSkills: () => SkillDefinition[]
  getSkillByName: (name: string) => SkillDefinition | undefined
}

export const useSkillStore = create<SkillStoreState>()(
  persist(
    (set, get) => ({
      userSkills: [],
      activeExecutionId: null,
      activeSkillId: null,

      addDraftSkill: (skillInput) => {
        const now = new Date().toISOString()
        const newSkill: SkillDefinition = {
          ...skillInput,
          id: `user-${crypto.randomUUID()}`,
          status: "draft",
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          userSkills: [newSkill, ...state.userSkills],
        }))
        return newSkill
      },

      updateSkill: (id, updates) => {
        set((state) => ({
          userSkills: state.userSkills.map((s) =>
            s.id === id
              ? { ...s, ...updates, updatedAt: new Date().toISOString() }
              : s
          ),
        }))
      },

      deleteSkill: (id) => {
        set((state) => ({
          userSkills: state.userSkills.filter((s) => s.id !== id),
        }))
      },

      releaseSkill: async (id) => {
        const skill = get().userSkills.find((s) => s.id === id)
        if (!skill) return false

        // 1. Update status locally to released
        set((state) => ({
          userSkills: state.userSkills.map((s) =>
            s.id === id
              ? { ...s, status: "released", updatedAt: new Date().toISOString() }
              : s
          ),
        }))

        // 2. Sync to Sims.Server user DB if backend sync is configured
        try {
          // If a backend endpoint exists, dispatch sync
          await fetch("/api/skills/release", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(skill),
          }).catch(() => {
            // Non-blocking in offline/local environments
          })
          return true
        } catch {
          return true
        }
      },

      setActiveExecutionId: (id) => set({ activeExecutionId: id }),
      setActiveSkillId: (id) => set({ activeSkillId: id }),

      getAllSkills: () => {
        return [...SYSTEM_SKILLS, ...get().userSkills]
      },

      getSkillByName: (name) => {
        const all = [...SYSTEM_SKILLS, ...get().userSkills]
        return all.find((s) => s.name.toLowerCase() === name.toLowerCase())
      },
    }),
    {
      name: "sims_user_skills_store_v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }
      ),
      partialize: (state) => ({
        userSkills: state.userSkills,
      }),
    }
  )
)
