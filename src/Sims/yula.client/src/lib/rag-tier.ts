/** Katmanlı RAG kapsamı: platform, workspace, kullanıcı (saf, import zincirsiz). */

export type RagVectorTier = "global" | "workspace" | "user";

export interface RagSearchFilter {
  /** Aktif workspace slug (örn: "stock"): workspace katmanı buna daraltılır. */
  workspace?: string;
  /** Aranacak katmanlar; verilmezse tümü. */
  tiers?: RagVectorTier[];
  maxDistance?: number;
}

/** Katman filtresini SQL WHERE cümlesine çevirir (saf, test edilebilir). */
export function buildRagWhereClause(filter: RagSearchFilter): string {
  const conditions: string[] = [];
  if (filter.tiers && filter.tiers.length > 0) {
    const tierList = filter.tiers.map((t) => `'${t}'`).join(", ");
    conditions.push(`tier IN (${tierList})`);
  }
  if (filter.workspace) {
    const ws = filter.workspace.replace(/'/g, "''");
    conditions.push(`(tier <> 'workspace' OR workspace = '${ws}')`);
  }
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}
