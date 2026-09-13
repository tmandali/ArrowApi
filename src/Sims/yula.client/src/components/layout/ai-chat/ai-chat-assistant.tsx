"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { WorkspaceSidePanelTrigger } from "@/components/layout/workspace-side-panel";
import { YulaMarkIcon } from "@/components/layout/yula-brand";
import { YULA } from "@/components/layout/yula-brand-data";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { isWorkspaceHomePath } from "@/lib/workspace-paths";
import { cn } from "@/utils/cn";

type AIChatAssistantProps = {
  className?: string;
  /** Vertical rule to the left of the toolbar control. */
  separator?: boolean;
};

/** Toolbar control — opens the workspace docked AI panel. */
export function AIChatAssistant({
  className,
  separator = true,
}: AIChatAssistantProps = {}) {
  const t = useTranslations("ChatAssistant");
  const router = useRouter();
  const { open, setOpen } = useWorkspaceAiChat();
  // Araç çubuğu uygulama kabuğunda yaşar; oturum henüz hazır değilken de
  // render edilir. newConversation yalnız tıklamada çağrılır — o ana kadar
  // oturum çoktan hazırdır, yine de null-güvenli tutulur.
  const { newConversation } = useOptionalYulaChat() ?? {};
  const pathname = usePathname();
  const isHomePage = isWorkspaceHomePath(pathname);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const [isAlone, setIsAlone] = React.useState(false);

  // Only show the left separator when other actions sit beside Yula; a lone
  // Yula button needs no divider.
  React.useLayoutEffect(() => {
    const el = toolbarRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const update = () => {
      const children = Array.from(parent.children);
      const index = children.indexOf(el);
      const hasLeadingAction = children
        .slice(0, index)
        .some((node) => (node as HTMLElement).offsetParent !== null);
      setIsAlone(!hasLeadingAction);
    };

    update();
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(parent, { childList: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(parent);
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  const showSeparator = separator !== false && !isAlone;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isHomePage) {
      newConversation?.();
      if (pathname !== "/") {
        router.push("/");
      }
    } else {
      setOpen(nextOpen);
    }
  };

  return (
    <div
      ref={toolbarRef}
      className={cn("flex items-center gap-1.5", className)}
    >
      {showSeparator ? (
        <Separator
          orientation="vertical"
          className="mx-0.5 data-vertical:h-4 data-vertical:self-auto"
        />
      ) : null}
      <WorkspaceSidePanelTrigger
        open={open}
        onOpenChange={handleOpenChange}
        iconOnly
        icon={YulaMarkIcon}
        aria-label={isHomePage ? t("new_chat_start") : t("yula_aria")}
        title={isHomePage ? t("new_chat_start") : YULA.name}
        className={cn(
          "group/ai size-7 border-none bg-transparent text-primary shadow-none hover:bg-transparent focus-visible:ring-0 active:scale-95 [&_svg]:!size-5",
          open && "bg-transparent hover:bg-transparent"
        )}
      >
        <YulaMarkIcon className="relative size-5 transition-transform duration-200 group-hover/ai:scale-110" />
      </WorkspaceSidePanelTrigger>
    </div>
  );
}
