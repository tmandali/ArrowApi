export type SystemUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Inactive";
  lastActive: string;
  /** Login provider'ı (keycloak/google/local) — admin/manuel satırlarda null. */
  provider: string | null;
  /** Provider'daki ham sub (Keycloak UUID / Google sayısal). */
  providerId: string | null;
};

/** Login kimliği (`user_identities`) — guest picker satırı. */
export type SystemIdentity = {
  id: string;
  provider: string | null;
  providerId: string | null;
  name: string | null;
  email: string | null;
  language: string | null;
  lastActive: string | null;
  createdAt: string | null;
  /** Katalog linki: null = GUEST. */
  userId: string | null;
  catalogRole: string | null;
  catalogStatus: string | null;
};

export const ROLE_OPTIONS = ["System Administrator", "Stock Manager", "Financial Analyst", "Viewer"] as const;
