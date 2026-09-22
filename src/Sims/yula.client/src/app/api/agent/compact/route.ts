import { POST as handlePost } from "../../compact/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handlePost(req);
}
