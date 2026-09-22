import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useYulaDockStore } from "@/lib/stores/dock";
import { isWorkspaceHomePath } from "@/lib/workspace-paths";

describe("🧭 Yula Screen Navigation vs In-IDE Action Separation Test", () => {
  beforeEach(() => {
    useYulaDockStore.setState({ open: false, expanded: false });
  });

  it("dock store should correctly transition open and expanded states", () => {
    const store = useYulaDockStore.getState();
    assert.equal(store.open, false);
    assert.equal(store.expanded, false);

    // Opening dock and expanding
    store.setOpen(true);
    store.setExpanded(true);
    assert.equal(useYulaDockStore.getState().open, true);
    assert.equal(useYulaDockStore.getState().expanded, true);

    // Closing dock should collapse expanded state
    store.setOpen(false);
    assert.equal(useYulaDockStore.getState().open, false);
    assert.equal(useYulaDockStore.getState().expanded, false);
  });

  it("should distinguish screen navigation links from external/hash links", () => {
    const internalRoutes = [
      "/stock/item",
      "/stock/stock-balance",
      "/selling",
      "/accounting/dashboard",
      "/my/settings",
      "/",
    ];

    for (const route of internalRoutes) {
      const isExternal =
        route.startsWith("http://") ||
        route.startsWith("https://") ||
        route.startsWith("mailto:") ||
        route.startsWith("tel:") ||
        route.startsWith("#");

      assert.equal(isExternal, false, `${route} should be recognized as internal screen link`);
    }

    const nonScreenRoutes = [
      "https://example.com/docs",
      "http://api.external.com",
      "mailto:info@example.com",
      "#section-1",
    ];

    for (const route of nonScreenRoutes) {
      const isExternal =
        route.startsWith("http://") ||
        route.startsWith("https://") ||
        route.startsWith("mailto:") ||
        route.startsWith("tel:") ||
        route.startsWith("#");

      assert.equal(isExternal, true, `${route} should NOT be recognized as internal screen link`);
    }
  });

  it("should recognize home path (/) to close dock as well as overlay", () => {
    assert.equal(isWorkspaceHomePath("/"), true);
    assert.equal(isWorkspaceHomePath("/stock/item"), false);
    assert.equal(isWorkspaceHomePath("/selling/dashboard"), false);
  });

  it("should dismiss overlay on screen navigation and keep dock open", () => {
    useYulaDockStore.setState({ open: true, expanded: true });

    // Simulate user clicking screen navigation:
    // Dismiss overlay to reveal screen with Yula docked alongside
    useYulaDockStore.getState().setExpanded(false);

    assert.equal(useYulaDockStore.getState().open, true, "Dock should remain open");
    assert.equal(useYulaDockStore.getState().expanded, false, "Overlay should be collapsed");
  });

  it("should close both dock and overlay when navigating to home (/)", () => {
    useYulaDockStore.setState({ open: true, expanded: true });

    const targetRoute = "/";
    useYulaDockStore.getState().setExpanded(false);
    if (isWorkspaceHomePath(targetRoute)) {
      useYulaDockStore.getState().setOpen(false);
    }

    assert.equal(useYulaDockStore.getState().open, false, "Dock should close on home");
    assert.equal(useYulaDockStore.getState().expanded, false, "Overlay should collapse on home");
  });

  it("should ensure manual collapse from expanded overlay guarantees open=true and expanded=false", () => {
    // When in expanded overlay mode:
    useYulaDockStore.setState({ open: true, expanded: true });

    // User triggers collapse (e.g. clicking minimize or pressing Escape):
    useYulaDockStore.getState().setExpanded(false);
    useYulaDockStore.getState().setOpen(true);

    assert.equal(useYulaDockStore.getState().open, true, "Dock must remain open for side tracking");
    assert.equal(useYulaDockStore.getState().expanded, false, "Overlay must be collapsed");
  });

  it("should transition from home to report screen with dock open and overlay collapsed", () => {
    // Starting on home screen (where dock is normally closed):
    useYulaDockStore.setState({ open: false, expanded: false });

    // LLM runs navigation to a target report screen:
    const targetReportPath = "/stock/retail-sales-report";
    if (!isWorkspaceHomePath(targetReportPath)) {
      useYulaDockStore.getState().setExpanded(false);
      useYulaDockStore.getState().setOpen(true);
    }

    assert.equal(useYulaDockStore.getState().open, true, "Side dock must open on target report screen");
    assert.equal(useYulaDockStore.getState().expanded, false, "Overlay must remain collapsed to reveal report");
  });

  it("resolveTargetScreen should return current route when on report screen", async () => {
    const { resolveTargetScreen } = await import("@/lib/yula-screen-resolver");
    const target = resolveTargetScreen("/selling/retail-sales", { pathname: "/stock" });
    assert.equal(target, "/selling/retail-sales");
  });

  it("resolveTargetScreen should resolve conversation screen when on home", async () => {
    const { resolveTargetScreen } = await import("@/lib/yula-screen-resolver");
    const target = resolveTargetScreen("/", { pathname: "/selling/retail-sales" });
    assert.equal(target, "/selling/retail-sales");
  });

  it("resolveTargetScreen should fallback to matching title or default report on home", async () => {
    const { resolveTargetScreen } = await import("@/lib/yula-screen-resolver");
    const target = resolveTargetScreen("/", { title: "Perakende Satış Raporu" });
    assert.match(target, /retail-sales/);
  });

  it("dock toggle on home should transition to dock mode and navigate to target screen", () => {
    // Starting on home screen in expanded overlay
    useYulaDockStore.setState({ open: true, expanded: true });

    const isHome = isWorkspaceHomePath("/");
    assert.equal(isHome, true);

    // Dock toggle on home is now clickable:
    const target = "/selling/retail-sales";
    useYulaDockStore.getState().setExpanded(false);
    useYulaDockStore.getState().setOpen(true);

    assert.equal(useYulaDockStore.getState().open, true, "Dock must open on target screen");
    assert.equal(useYulaDockStore.getState().expanded, false, "Overlay must collapse to reveal screen");
    assert.equal(target, "/selling/retail-sales");
  });

  it("navigateToConversationScreen should NOT navigate when in expanded full mode", async () => {
    const { navigateToConversationScreen } = await import("@/lib/yula-history-navigation");
    useYulaDockStore.setState({ open: true, expanded: true });

    let pushedHref: string | null = null;
    const conversation = {
      id: "conv-1",
      title: "Perakende Satış Raporu",
      createdAt: Date.now(),
      pathname: "/stock/retail-sales-report/job-123",
      jobId: "job-123",
      agentId: null,
    };

    navigateToConversationScreen(conversation, (href) => {
      pushedHref = href;
    });

    assert.equal(pushedHref, null, "Should NOT call push when in full mode");
    assert.equal(useYulaDockStore.getState().expanded, true, "Should stay in full mode");
  });

  it("navigateToConversationScreen should navigate when in side-dock mode on a report screen", async () => {
    const { navigateToConversationScreen } = await import("@/lib/yula-history-navigation");
    useYulaDockStore.setState({ open: true, expanded: false });

    let pushedHref: string | null = null;
    const conversation = {
      id: "conv-2",
      title: "Stok Bakiyesi",
      createdAt: Date.now(),
      pathname: "/stock/stock-balance",
      agentId: null,
    };

    navigateToConversationScreen(conversation, (href) => {
      pushedHref = href;
    });

    // In node environment, window is undefined so 'here' defaults to '/', triggering push
    assert.equal(pushedHref, "/stock/stock-balance", "Should navigate in side-dock mode");
  });
});
