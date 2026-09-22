import { GET as handleGet } from "../agent/models/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleGet(req);
}
