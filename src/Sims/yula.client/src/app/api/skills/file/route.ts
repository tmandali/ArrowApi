import path from "node:path";
import { NextResponse } from "next/server";
import { createNodeSandbox } from "@/lib/skill-sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set([".mjs", ".md", ".txt", ".json"]);
const MAX_CHARS = 64_000;

/**
 * Skill paketi dosya metni (salt-okunur önizleme): `skills/` jail'i içinde
 * allowlist'li uzantılar. Yürütme yapmaz — koşturma `run_skill_script` işidir.
 */
export async function GET(req: Request) {
  const relPath = new URL(req.url).searchParams.get("path") ?? "";
  const ext = path.extname(relPath).toLowerCase();
  if (!relPath || !ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Yalnızca skills altındaki .mjs/.md/.txt/.json dosyaları okunur." },
      { status: 400 },
    );
  }
  const sandbox = createNodeSandbox(
    process.env.YULA_SKILLS_DIR ?? path.join(process.cwd(), "skills"),
  );
  try {
    const content = await sandbox.readFile(relPath, "utf-8");
    return NextResponse.json({
      path: relPath,
      content: content.slice(0, MAX_CHARS),
      truncated: content.length > MAX_CHARS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 404 },
    );
  }
}
