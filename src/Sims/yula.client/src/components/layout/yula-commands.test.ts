import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SYSTEM_COMMANDS,
  PROVIDER_SUBCOMMANDS,
  matchProviderSubcommands,
} from "./yula-commands";
import { promptTemplateManager } from "@my-agent/core";

describe("Yula /provider & /login Command Suite", () => {
  it("SYSTEM_COMMANDS contains provider and login with phase=system", () => {
    const providerCmd = SYSTEM_COMMANDS.find((c) => c.id === "provider");
    const loginCmd = SYSTEM_COMMANDS.find((c) => c.id === "login");

    assert.ok(providerCmd, "provider command should exist");
    assert.equal(providerCmd?.phase, "system");
    assert.equal(providerCmd?.slash, "provider");

    assert.ok(loginCmd, "login command should exist");
    assert.equal(loginCmd?.phase, "system");
    assert.equal(loginCmd?.slash, "login");
  });

  it("PROVIDER_SUBCOMMANDS includes standard and expanded providers", () => {
    const ids = PROVIDER_SUBCOMMANDS.map((p) => p.slash);
    assert.ok(ids.includes("ollama"));
    assert.ok(ids.includes("azure"));
    assert.ok(ids.includes("openai"));
    assert.ok(ids.includes("agnes"));
    assert.ok(ids.includes("openrouter"));
    assert.ok(ids.includes("nvidia"));
    assert.ok(ids.includes("opencode"));
  });

  it("matchProviderSubcommands filters correctly and decorates badges & sorting", () => {
    const azureMatches = matchProviderSubcommands("azure");
    assert.equal(azureMatches.length, 1);
    assert.equal(azureMatches[0].slash, "azure");

    const ollamaMatches = matchProviderSubcommands("ollama");
    assert.equal(ollamaMatches.length, 1);
    assert.equal(ollamaMatches[0].slash, "ollama");

    const allMatches = matchProviderSubcommands("");
    assert.equal(allMatches.length, PROVIDER_SUBCOMMANDS.length);

    // Test with availableProviderIds and activeProvider
    const decorated = matchProviderSubcommands("", {
      availableProviderIds: ["azure", "ollama"],
      activeProvider: "azure",
      activeLabel: "Aktif",
      loggedInLabel: "Giriş yapıldı",
      notConfiguredLabel: "Giriş gerekli",
    });

    assert.equal(decorated.length, PROVIDER_SUBCOMMANDS.length);
    // Active provider should be first
    assert.equal(decorated[0].slash, "azure");
    assert.equal(decorated[0].badge, "Aktif");
    assert.equal(decorated[0].badgeVariant, "active");
    assert.equal(decorated[0].isLoggedIn, true);

    // Logged in provider should be next
    assert.equal(decorated[1].slash, "ollama");
    assert.equal(decorated[1].badge, "Giriş yapıldı");
    assert.equal(decorated[1].badgeVariant, "success");
    assert.equal(decorated[1].isLoggedIn, true);

    // Non-configured providers should have muted badge
    const nonConfigured = decorated.find((p) => p.slash === "openai");
    assert.ok(nonConfigured);
    assert.equal(nonConfigured?.badge, "Giriş gerekli");
    assert.equal(nonConfigured?.badgeVariant, "muted");
    assert.equal(nonConfigured?.isLoggedIn, false);
  });

  it("promptTemplateManager recognizes /provider azure as system command (zero LLM calls)", () => {
    assert.equal(promptTemplateManager.isSystemCommand("/provider azure"), true);
    assert.equal(promptTemplateManager.isSystemCommand("/provider ollama"), true);
    assert.equal(promptTemplateManager.isSystemCommand("/login azure"), true);

    const resolved = promptTemplateManager.resolveInput("/provider azure");
    assert.equal(resolved.isCommand, true);
    assert.equal(resolved.isSystem, true);
    assert.equal(resolved.command, "/provider");
    assert.deepEqual(resolved.args, ["azure"]);
  });

  it("matchModelSubcommands lists models from authorized providers and filters correctly", () => {
    const { matchModelSubcommands } = require("./yula-commands");
    const all = matchModelSubcommands("");
    assert.ok(all.length > 0);

    const gemmaMatches = matchModelSubcommands("gemma");
    assert.ok(gemmaMatches.length > 0);
    assert.ok(gemmaMatches.some((m: any) => m.slash.includes("gemma")));

    const gptMatches = matchModelSubcommands("gpt-4o");
    assert.ok(gptMatches.length > 0);
    assert.ok(gptMatches.some((m: any) => m.slash.includes("gpt-4o")));

    const refreshMatches = matchModelSubcommands("refresh");
    assert.ok(refreshMatches.some((m: any) => m.id === "model:refresh"));

    // Test activeProvider sorting and badges
    const nvidiaSorted = matchModelSubcommands("", undefined, false, "nvidia");
    assert.ok(nvidiaSorted.length > 0);
    assert.equal(nvidiaSorted[0].pagePath, "nvidia");
    assert.equal(nvidiaSorted[0].badge, "Aktif");
    assert.equal(nvidiaSorted[0].badgeVariant, "active");
  });
});
