import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldLabel,
} from "@/components/ui/field"
import {
  Timeline,
  TimelineItem,
  TimelineDot,
  TimelineContent,
  TimelineTitle,
  TimelineTime,
} from "@/components/ui/timeline"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Send,
  User as UserIcon,
  Settings,
  Paperclip,
  Share2,
  Copy,
  Pencil,
} from "lucide-react"

export default function UserSettingsPage() {
  const [isEnabled, setIsEnabled] = React.useState(true)
  const [changePasswordOpen, setChangePasswordOpen] = React.useState(false)
  const [documentFollowOpen, setDocumentFollowOpen] = React.useState(false)
  const [emailOpen, setEmailOpen] = React.useState(false)
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false)
  const [appOpen, setAppOpen] = React.useState(false)
  const [thirdPartyAuthOpen, setThirdPartyAuthOpen] = React.useState(true)

  return (
    <>
      {/* Header Navigation & Actions */}
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 backdrop-blur px-4 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList className="text-xs">
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Users</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold text-foreground">
                    John Doe
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2">
            <Select defaultValue="password">
              <SelectTrigger className="h-7 text-xs font-normal gap-1 px-2.5">
                <SelectValue placeholder="Password" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="password">Password</SelectItem>
                <SelectItem value="set-password">Set Password</SelectItem>
                <SelectItem value="reset-password">Reset Password</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center border rounded-md divide-x">
              <Button variant="ghost" size="icon" className="size-7 rounded-none">
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 rounded-none">
                <ChevronRight className="size-3.5" />
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-7">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>User Permissions</DropdownMenuItem>
                <DropdownMenuItem>Reload</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" className="h-7 text-xs px-3">
              Save
            </Button>

            <AIChatAssistant variant="toolbar" />
          </div>
        </header>

        <WorkspaceAiDock>
        {/* Tabs Component (variant="line") matching selling template */}
        <Tabs defaultValue="user-details" className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b bg-background px-4 py-1">
            <TabsList variant="line">
              <TabsTrigger value="user-details">User Details</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="connections">Connections</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="user-details" className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
            {/* Main Form Content */}
            <div className="flex-1 p-6 space-y-6">
              {/* Enabled Checkbox */}
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="enabled"
                  checked={isEnabled}
                  onCheckedChange={(c) => setIsEnabled(!!c)}
                />
                <Label htmlFor="enabled" className="text-xs font-semibold cursor-pointer text-foreground select-none">
                  Enabled
                </Label>
              </div>

              {/* Basic Info Section */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-semibold text-foreground">Basic Info</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Row 1 */}
                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      Email <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      defaultValue="john.doe@demo.com"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">Full Name</FieldLabel>
                    <Input
                      defaultValue="John Doe"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">Language</FieldLabel>
                    <Select defaultValue="english">
                      <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="turkish">Turkish</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Row 2 */}
                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">
                      First Name <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      defaultValue="John"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">Username</FieldLabel>
                    <Input
                      defaultValue="johndoe"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">Time Zone</FieldLabel>
                    <Select defaultValue="asia-kolkata">
                      <SelectTrigger className="bg-muted/30 border-muted-foreground/20 h-9 text-xs font-medium">
                        <SelectValue placeholder="Time Zone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asia-kolkata">Asia/Kolkata</SelectItem>
                        <SelectItem value="europe-istanbul">Europe/Istanbul</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Row 3 */}
                  <Field>
                    <FieldLabel className="text-xs text-muted-foreground">Last Name</FieldLabel>
                    <Input
                      defaultValue="Doe"
                      className="bg-muted/30 border-muted-foreground/20 font-medium h-9 text-xs"
                    />
                  </Field>
                </div>
              </div>

              <Separator className="my-6" />

              {/* Comments Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Comments</h3>

                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      JD
                    </AvatarFallback>
                  </Avatar>
                  <div className="relative flex-1">
                    <Input
                      placeholder="Type a reply / comment"
                      className="bg-muted/20 border-muted-foreground/20 h-9 text-xs pr-10"
                    />
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-muted-foreground hover:text-foreground">
                      <Send className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              {/* Activity Timeline Section (Exact matching screenshot text) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Activity</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                    <Plus className="size-3.5 mr-1" /> New Email
                  </Button>
                </div>

                <Timeline>
                  <TimelineItem>
                    <TimelineDot />
                    <TimelineContent>
                      <TimelineTitle>
                        <span className="font-medium">Administrator</span> changed the value of Username from <span className="font-medium">john</span> to <span className="font-medium">johndoe</span> ·{" "}
                        <TimelineTime>1 year ago</TimelineTime>
                      </TimelineTitle>
                    </TimelineContent>
                  </TimelineItem>

                  <TimelineItem>
                    <TimelineDot />
                    <TimelineContent>
                      <TimelineTitle>
                        <span className="font-medium">Administrator</span> last edited this ·{" "}
                        <TimelineTime>1 year ago</TimelineTime>
                      </TimelineTitle>
                    </TimelineContent>
                  </TimelineItem>

                  <TimelineItem>
                    <TimelineDot />
                    <TimelineContent>
                      <TimelineTitle>
                        <span className="font-medium">Administrator</span> added rows for Social Logins ·{" "}
                        <TimelineTime>1 year ago</TimelineTime>
                      </TimelineTitle>
                    </TimelineContent>
                  </TimelineItem>

                  <TimelineItem>
                    <TimelineDot />
                    <TimelineContent>
                      <TimelineTitle>
                        <span className="font-medium">Administrator</span> removed rows for Social Logins ·{" "}
                        <TimelineTime>1 year ago</TimelineTime>
                      </TimelineTitle>
                    </TimelineContent>
                  </TimelineItem>
                </Timeline>
              </div>
            </div>

            {/* Right Sidebar Metadata */}
            <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">John Doe</h4>
                  <p className="text-muted-foreground text-xs font-mono">john.doe@demo.com</p>
                </div>
                <Button variant="ghost" size="icon" className="size-6">
                  <Copy className="size-3.5 text-muted-foreground" />
                </Button>
              </div>

              <Separator />

              <div className="space-y-1">
                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <UserIcon className="size-3.5" />
                    Assign
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Paperclip className="size-3.5" />
                    Attachments
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Share2 className="size-3.5" />
                    Share
                  </span>
                  <Plus className="size-3.5" />
                </Button>
              </div>

              <Separator />

              <div className="space-y-3 text-muted-foreground text-[11px]">
                <div>
                  <p className="font-medium text-foreground">Administrator</p>
                  <p>last edited this · 1 year ago</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Administrator</p>
                  <p>created this · 1 year ago</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="flex-1 flex flex-col lg:flex-row overflow-y-auto m-0">
            {/* Settings Tab Content */}
            <div className="flex-1 p-6 space-y-6">
              {/* Collapsible Sections List matching screenshot */}
              <div className="space-y-3">
                <Collapsible open={changePasswordOpen} onOpenChange={setChangePasswordOpen} className="border-b pb-3">
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                    <span>Change Password</span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform duration-200 ${
                        changePasswordOpen ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground space-y-3">
                    <p>Old Password & New Password controls.</p>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={documentFollowOpen} onOpenChange={setDocumentFollowOpen} className="border-b pb-3">
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                    <span>Document Follow</span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform duration-200 ${
                        documentFollowOpen ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                    Document follow notification preferences.
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={emailOpen} onOpenChange={setEmailOpen} className="border-b pb-3">
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                    <span>Email</span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform duration-200 ${
                        emailOpen ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                    Email notification settings.
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={workspaceOpen} onOpenChange={setWorkspaceOpen} className="border-b pb-3">
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                    <span>Workspace</span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform duration-200 ${
                        workspaceOpen ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                    Workspace display preferences.
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={appOpen} onOpenChange={setAppOpen} className="border-b pb-3">
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                    <span>App</span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform duration-200 ${
                        appOpen ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 pl-2 text-xs text-muted-foreground">
                    App UI settings.
                  </CollapsibleContent>
                </Collapsible>

                {/* Third Party Authentication (Open by Default matching screenshot) */}
                <Collapsible open={thirdPartyAuthOpen} onOpenChange={setThirdPartyAuthOpen} className="border-b pb-3">
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold text-foreground hover:text-foreground/80">
                    <span>Third Party Authentication</span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform duration-200 ${
                        thirdPartyAuthOpen ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4 space-y-3">
                    <h4 className="text-xs font-medium text-muted-foreground">Social Logins</h4>
                    
                    {/* Table matching screenshot */}
                    <div className="rounded-md border bg-card overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/40 text-xs">
                          <TableRow className="border-b hover:bg-transparent">
                            <TableHead className="w-10 text-center">
                              <Checkbox />
                            </TableHead>
                            <TableHead className="w-12">No.</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>User ID</TableHead>
                            <TableHead className="w-10 text-center">
                              <Settings className="size-3.5 mx-auto text-muted-foreground" />
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y text-xs">
                          <TableRow>
                            <TableCell className="text-center">
                              <Checkbox />
                            </TableCell>
                            <TableCell className="font-medium text-foreground">1</TableCell>
                            <TableCell className="font-medium text-foreground">frappe</TableCell>
                            <TableCell className="text-muted-foreground"></TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              4a770832b401964e1dc7d3ecd080...
                            </TableCell>
                            <TableCell className="text-center">
                              <Button variant="ghost" size="icon" className="size-6 text-muted-foreground">
                                <Pencil className="size-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <Separator className="my-6" />

              {/* Comments Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Comments</h3>

                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      JD
                    </AvatarFallback>
                  </Avatar>
                  <div className="relative flex-1">
                    <Input
                      placeholder="Type a reply / comment"
                      className="bg-muted/20 border-muted-foreground/20 h-9 text-xs pr-10"
                    />
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-muted-foreground hover:text-foreground">
                      <Send className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              {/* Activity Timeline Section (Exact matching screenshot text) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Activity</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                    <Plus className="size-3.5 mr-1" /> New Email
                  </Button>
                </div>

                <Timeline>
                  <TimelineItem>
                    <TimelineDot />
                    <TimelineContent>
                      <TimelineTitle>
                        <span className="font-medium">Administrator</span> changed the value of Username from <span className="font-medium">john</span> to <span className="font-medium">johndoe</span> ·{" "}
                        <TimelineTime>1 year ago</TimelineTime>
                      </TimelineTitle>
                    </TimelineContent>
                  </TimelineItem>

                  <TimelineItem>
                    <TimelineDot />
                    <TimelineContent>
                      <TimelineTitle>
                        <span className="font-medium">Administrator</span> last edited this ·{" "}
                        <TimelineTime>1 year ago</TimelineTime>
                      </TimelineTitle>
                    </TimelineContent>
                  </TimelineItem>

                  <TimelineItem>
                    <TimelineDot />
                    <TimelineContent>
                      <TimelineTitle>
                        <span className="font-medium">Administrator</span> added rows for Social Logins ·{" "}
                        <TimelineTime>1 year ago</TimelineTime>
                      </TimelineTitle>
                    </TimelineContent>
                  </TimelineItem>

                  <TimelineItem>
                    <TimelineDot />
                    <TimelineContent>
                      <TimelineTitle>
                        <span className="font-medium">Administrator</span> removed rows for Social Logins ·{" "}
                        <TimelineTime>1 year ago</TimelineTime>
                      </TimelineTitle>
                    </TimelineContent>
                  </TimelineItem>
                </Timeline>
              </div>
            </div>

            {/* Right Sidebar Metadata */}
            <div className="w-full lg:w-72 border-l p-4 space-y-6 text-xs bg-muted/10">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">John Doe</h4>
                  <p className="text-muted-foreground text-xs font-mono">john.doe@demo.com</p>
                </div>
                <Button variant="ghost" size="icon" className="size-6">
                  <Copy className="size-3.5 text-muted-foreground" />
                </Button>
              </div>

              <Separator />

              <div className="space-y-1">
                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <UserIcon className="size-3.5" />
                    Assign
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Paperclip className="size-3.5" />
                    Attachments
                  </span>
                  <Plus className="size-3.5" />
                </Button>

                <Button variant="ghost" className="w-full justify-between h-8 text-xs font-normal px-2 text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Share2 className="size-3.5" />
                    Share
                  </span>
                  <Plus className="size-3.5" />
                </Button>
              </div>

              <Separator />

              <div className="space-y-3 text-muted-foreground text-[11px]">
                <div>
                  <p className="font-medium text-foreground">Administrator</p>
                  <p>last edited this · 1 year ago</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Administrator</p>
                  <p>created this · 1 year ago</p>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="connections" className="p-6 m-0 text-xs text-muted-foreground">
            Connected Social Logins & Roles
          </TabsContent>
      </Tabs>
        </WorkspaceAiDock>
    </>
  )
}
