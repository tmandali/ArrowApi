"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/utils/cn";
import { YULA } from "@/components/layout/yula-brand-data";
import { useActiveDiagramStore } from "@/lib/stores/active-diagram-store";
import { useTelemetryMonitorStore } from "@/lib/stores/telemetry-monitor";
import { AIChatPanel } from "@/components/layout/ai-chat/ai-chat-panel";
import { MermaidBlock } from "@/components/layout/chat-markdown/mermaid-block";
import { YulaContextUsageBadge } from "@/components/layout/yula-context-usage-badge";
import {
  pageInsetGutterClass,
  panelCardClass,
  panelHeaderClass,
  panelResizeHandleClass,
} from "@/components/layout/panel-chrome";
import { YulaIdeSidebar } from "./fullscreen-overlay/yula-ide-sidebar";
import { YulaIdeDetailHeader } from "./fullscreen-overlay/yula-ide-detail-header";
import { TelemetryDetailView } from "./fullscreen-overlay/telemetry-detail-view";
import { YulaConversationTitleEditable } from "./fullscreen-overlay/yula-conversation-title-editable";
import { useExitOverlay } from "./fullscreen-overlay/use-exit-overlay";
import {
  YulaDeleteChatButton,
  YulaDetailToggleButton,
  YulaExitOverlayButton,
  YulaNewChatButton,
} from "./fullscreen-overlay/yula-dock-controls";

export interface YulaFullscreenOverlayProps {
  className?: string;
  panelHeaderClass?: string;
  centeredIntro?: boolean;
  headerTitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  headerActions?: React.ReactNode;
  defaultSidebarOpen?: boolean;
  hideWindowControls?: boolean;
  isOverlay?: boolean;
}

export function YulaFullscreenOverlay({
  className,
  centeredIntro,
  headerExtra,
  headerActions,
  defaultSidebarOpen = true,
  hideWindowControls = false,
  isOverlay = true,
}: YulaFullscreenOverlayProps) {
  const t = useTranslations("ChatMarkdown");
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultSidebarOpen);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleExit = useExitOverlay();
  const {
    isOpen: isTelemetryOpen,
    activeView: telemetryActiveView,
    setActiveView: setTelemetryActiveView,
    close: closeTelemetry,
  } = useTelemetryMonitorStore();

  const {
    activeDiagram,
    isMaximized: isCanvasMaximized,
    closeDiagram,
  } = useActiveDiagramStore();

  const isDetailOpen = isTelemetryOpen || Boolean(activeDiagram);
  const currentDetailView = telemetryActiveView;

  React.useEffect(() => {
    if (activeDiagram) {
      setTelemetryActiveView("diagram");
    }
  }, [activeDiagram, setTelemetryActiveView]);

  const handleCloseDetail = React.useCallback(() => {
    closeTelemetry();
    if (activeDiagram) {
      closeDiagram();
    }
  }, [closeTelemetry, activeDiagram, closeDiagram]);

  // Escape key collapses overlay back to side dock
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleExit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleExit]);

  return (
    <div
      role={isOverlay ? "dialog" : "region"}
      aria-label={YULA.name}
      className={cn(
        isOverlay
          ? "absolute inset-0 z-40 flex min-h-0 flex-col bg-background [background-image:var(--app-bg-gradient)]"
          : "flex h-full min-h-0 w-full flex-col bg-background [background-image:var(--app-bg-gradient)]",
        className,
      )}
    >
      <div className={cn("flex min-h-0 flex-1 overflow-hidden", pageInsetGutterClass)}>
        {isCanvasMaximized && isDetailOpen ? (
          <div className={cn(panelCardClass, "h-full w-full")}>
            <YulaIdeDetailHeader
              activeView={currentDetailView}
              onViewChange={setTelemetryActiveView}
              activeDiagram={activeDiagram}
              containerRef={containerRef}
              onClose={handleCloseDetail}
            />
            {currentDetailView === "diagram" && activeDiagram ? (
              <div
                ref={containerRef}
                className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/5 min-h-0"
              >
                <MermaidBlock
                  chart={activeDiagram.chart}
                  fitCanvas
                  className="w-full h-full border-0 rounded-none my-0 bg-transparent flex flex-col items-center justify-center"
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden">
                <TelemetryDetailView />
              </div>
            )}
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
            {/* Column 1: IDE Left Sidebar */}
            {sidebarOpen ? (
              <>
                <ResizablePanel
                  defaultSize="22%"
                  minSize="16%"
                  maxSize="32%"
                  className="flex min-h-0 flex-col"
                >
                  <YulaIdeSidebar />
                </ResizablePanel>
                <ResizableHandle withHandle className={panelResizeHandleClass} />
              </>
            ) : null}

            {/* Column 2: Center Chat Stream */}
            <ResizablePanel
              defaultSize={
                isDetailOpen
                  ? sidebarOpen
                    ? "38%"
                    : "45%"
                  : sidebarOpen
                    ? "78%"
                    : "100%"
              }
              minSize="25%"
              className="flex min-h-0 flex-col"
            >
              <div className={cn(panelCardClass, "h-full w-full")}>
                {/* Column 2 Top Header Bar (Breadcrumb & Actions) */}
                <div className={cn(panelHeaderClass, "bg-card")}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-ide-action="true"
                      onClick={() => setSidebarOpen((prev) => !prev)}
                      title={t("toggle_sidebar")}
                      aria-label={t("toggle_sidebar")}
                      className="size-7 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <PanelLeft className="size-3.5" />
                    </Button>

                    <YulaConversationTitleEditable />
                    {headerExtra}
                  </div>

                  <div className="flex min-w-0 items-center gap-0.5">
                    {headerActions}
                    <YulaContextUsageBadge />
                    <YulaDetailToggleButton />
                    <YulaNewChatButton />
                    <YulaDeleteChatButton />
                    {!hideWindowControls && <YulaExitOverlayButton />}
                  </div>
                </div>

                {/* Chat Body */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <AIChatPanel mode="main" centeredIntro={centeredIntro} />
                </div>
              </div>
            </ResizablePanel>

            {/* Column 3: Right Detail Panel (Diagram Canvas + Telemetry Monitor) */}
            {isDetailOpen ? (
              <>
                <ResizableHandle withHandle className={panelResizeHandleClass} />
                <ResizablePanel
                  defaultSize={sidebarOpen ? "40%" : "55%"}
                  minSize="30%"
                  maxSize="70%"
                  className="flex min-h-0 flex-col"
                >
                  <div className={cn(panelCardClass, "h-full w-full")}>
                    <YulaIdeDetailHeader
                      activeView={currentDetailView}
                      onViewChange={setTelemetryActiveView}
                      activeDiagram={activeDiagram}
                      containerRef={containerRef}
                      onClose={handleCloseDetail}
                    />
                    {currentDetailView === "diagram" && activeDiagram ? (
                      <div
                        ref={containerRef}
                        className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/5 min-h-0"
                      >
                        <MermaidBlock
                          chart={activeDiagram.chart}
                          fitCanvas
                          className="w-full h-full border-0 rounded-none my-0 bg-transparent flex flex-col items-center justify-center"
                        />
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <TelemetryDetailView />
                      </div>
                    )}
                  </div>
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );

}
