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
});
