"use client";

import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant";
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock";
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header";
import { panelCardClass, pageContentGutterClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, Search, ShieldCheck, MoreVertical, CheckCircle2, XCircle } from "lucide-react";

export function SystemUsersView() {
  const [searchTerm, setSearchTerm] = React.useState("");

  const mockUsers = [
    {
      id: "usr_101",
      name: "Timur MANDALI",
      email: "timur.mandali@lcwaikiki.com",
      role: "System Administrator",
      status: "Active",
      lastActive: "Now",
    },
    {
      id: "usr_102",
      name: "John Doe",
      email: "john.doe@demo.com",
      role: "Stock Manager",
      status: "Active",
      lastActive: "2 hours ago",
    },
    {
      id: "usr_103",
      name: "Jane Smith",
      email: "jane.smith@demo.com",
      role: "Financial Analyst",
      status: "Active",
      lastActive: "1 day ago",
    },
    {
      id: "usr_104",
      name: "Guest User",
      email: "guest@demo.com",
      role: "Viewer",
      status: "Inactive",
      lastActive: "1 month ago",
    },
  ];

  const filteredUsers = mockUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        actions={
          <>
            <Button size="sm" className="h-7 px-3 text-xs gap-1.5">
              <UserPlus className="size-3.5" />
              Yeni Kullanıcı Ekle
            </Button>
            <AIChatAssistant />
          </>
        }
      >
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink href="#">System Administration</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                Tüm Kullanıcılar & Yetkiler
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>

      <WorkspaceAiDock>
        <div
          className={cn(
            pageContentGutterClass,
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          )}
        >
          <div className={cn(panelCardClass, "min-h-0 flex-1 flex flex-col p-4 md:p-6 space-y-4 overflow-hidden")}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  Sistem Kullanıcı Dizin Kataloğu
                </h2>
                <p className="text-xs text-muted-foreground">
                  Sistemdeki tüm kayıtlı kullanıcıların rolleri, erişim izinleri ve oturum durumları.
                </p>
              </div>

              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Kullanıcı ara..."
                  className="h-8 pl-8 text-xs bg-muted/20 border-muted-foreground/20"
                />
              </div>
            </div>

            <div className="rounded-md border bg-card flex-1 overflow-auto">
              <Table>
                <TableHeader className="bg-muted/40 text-xs sticky top-0 bg-card">
                  <TableRow className="border-b hover:bg-transparent">
                    <TableHead className="w-12">ID</TableHead>
                    <TableHead>Ad Soyad</TableHead>
                    <TableHead>E-Posta</TableHead>
                    <TableHead>Rol & Yetki</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Son Aktivite</TableHead>
                    <TableHead className="w-10 text-center">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y text-xs">
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-muted-foreground">{user.id}</TableCell>
                      <TableCell className="font-semibold text-foreground">{user.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] font-medium">
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.status === "Active" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="size-3" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                            <XCircle className="size-3" /> Pasif
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.lastActive}</TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground">
                          <MoreVertical className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </WorkspaceAiDock>
    </div>
  );
}
