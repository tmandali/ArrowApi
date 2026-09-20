import { NextRequest, NextResponse } from "next/server";
import { serverPlaybookService } from "@/lib/playbook-server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspace = searchParams.get("workspace") || "stock";
    const proposals = await serverPlaybookService.getProposals(workspace);
    return NextResponse.json({ success: true, proposals });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Taslak öneriler alınamadı" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = "create", id, workspace = "stock", reviewer, reason, ...rest } = body;

    if (action === "approve") {
      if (!id) {
        return NextResponse.json(
          { success: false, error: "Onaylamak için 'id' gereklidir." },
          { status: 400 },
        );
      }
      const entry = await serverPlaybookService.approveProposal(id, workspace, reviewer || "Yönetici");
      if (!entry) {
        return NextResponse.json(
          { success: false, error: `Taslak ${id} bulunamadı veya onaylanamadı.` },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, entry });
    }

    if (action === "reject") {
      if (!id) {
        return NextResponse.json(
          { success: false, error: "Reddetmek için 'id' gereklidir." },
          { status: 400 },
        );
      }
      const removed = await serverPlaybookService.rejectProposal(id, workspace, reason);
      return NextResponse.json({ success: true, removed });
    }

    // Default: yeni taslak öneri oluşturma
    const { category, title, content, target_path, scope, author, proposedBy } = rest;
    if (!title || !content || !category) {
      return NextResponse.json(
        { success: false, error: "Eksik parametre: title, content ve category zorunludur." },
        { status: 400 },
      );
    }

    const entry = await serverPlaybookService.proposeEntry({
      id,
      category,
      title,
      contentMarkdown: content,
      targetPath: target_path,
      workspaceId: workspace,
      scope: scope || "workspace",
      author: author || "Kullanıcı",
      proposedBy: proposedBy || author || "Kullanıcı",
    });

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Taslak işlem hatası" },
      { status: 500 },
    );
  }
}
