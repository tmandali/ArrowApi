import { NextRequest, NextResponse } from "next/server";
import { PlaybookService } from "@my-agent/core";
import { serverPlaybookStorage } from "@/lib/playbook-server";

// Sunucu tarafında ServerFsPlaybookStorage ile başlatılan servis
const serverPlaybookService = new PlaybookService(serverPlaybookStorage);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspace = searchParams.get("workspace") || "stock";
    const pathname = searchParams.get("pathname");
    const task = searchParams.get("task");
    const type = searchParams.get("type") || "all";

    if (type === "rules" && pathname) {
      const rules = await serverPlaybookService.getScreenRules(pathname, workspace);
      return NextResponse.json({ success: true, rules });
    }

    if (type === "recipe" && task) {
      const recipe = await serverPlaybookService.findRecipe(task, workspace);
      return NextResponse.json({ success: true, recipe });
    }

    if (type === "index") {
      const index = await serverPlaybookService.getIndex(workspace);
      return NextResponse.json({ success: true, index });
    }

    if (type === "log") {
      const log = await serverPlaybookService.getLog(workspace);
      return NextResponse.json({ success: true, log });
    }

    // Default: tüm kayıtları ve index'i döner
    const entries = await serverPlaybookStorage.readEntries(workspace);
    const index = await serverPlaybookService.getIndex(workspace);
    const log = await serverPlaybookService.getLog(workspace);

    return NextResponse.json({ success: true, entries, index, log });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Playbook sorgulama hatası" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, title, content, target_path, workspace, scope, author, tags, id } = body;

    if (!title || !content || !category) {
      return NextResponse.json(
        { success: false, error: "Eksik parametre: title, content ve category zorunludur." },
        { status: 400 },
      );
    }

    const entry = await serverPlaybookService.recordEntry({
      id,
      category,
      title,
      contentMarkdown: content,
      targetPath: target_path,
      workspaceId: workspace || "stock",
      scope: scope || "workspace",
      author: author || "Kullanıcı",
      tags: Array.isArray(tags) ? tags : undefined,
    });

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Playbook kayıt hatası" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const workspace = searchParams.get("workspace") || "stock";

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Eksik parametre: id zorunludur." },
        { status: 400 },
      );
    }

    const removed = await serverPlaybookService.removeEntry(id, workspace);
    return NextResponse.json({ success: true, removed });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Playbook silme hatası" },
      { status: 500 },
    );
  }
}
