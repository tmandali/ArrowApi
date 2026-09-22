"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProviderDialogStore } from "@/lib/stores/provider-dialog-store";
import { useChatsStore } from "@/lib/stores/chats";
import {
  readYulaClientAiConfig,
  writeYulaClientAiConfig,
  getSavedEndpointForProvider,
  saveEndpointForProvider,
  isProviderLoggedIn,
  markProviderLoggedOut,
  unmarkProviderLoggedOut,
  getClientSecretForProvider,
  saveClientSecretForProvider,
  deleteClientSecretForProvider,
  getCachedAvailableProviders,
} from "@/lib/yula-ai-client-config";
import type { AIProviderType } from "@/lib/yula-config";
import { Layers, Server, Eye, EyeOff, Globe, Key, LogOut } from "lucide-react";

const PROVIDER_DEFAULTS: Record<string, { endpoint: string; name: string }> = {
  azure: {
    endpoint: "https://tmandali-resource.openai.azure.com/openai/v1",
    name: "Microsoft Foundry (Azure OpenAI)",
  },
  ollama: {
    endpoint: "http://127.0.0.1:11434",
    name: "Ollama (Yerel / LAN)",
  },
  openai: {
    endpoint: "https://api.openai.com/v1",
    name: "OpenAI / Uyumlu API",
  },
  agnes: {
    endpoint: "https://apihub.agnes-ai.com/v1",
    name: "Agnes AI Gateway",
  },
  nvidia: {
    endpoint: "https://integrate.api.nvidia.com/v1",
    name: "NVIDIA NIM",
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1",
    name: "OpenRouter",
  },
  opencode: {
    endpoint: "https://api.opencode.ai/v1",
    name: "OpenCode",
  },
  google: {
    endpoint: "https://generativelanguage.googleapis.com",
    name: "Google AI Studio",
  },
};

function resolveProviderEndpoint(prov: string): string {
  const norm = prov.toLowerCase();
  const saved = getSavedEndpointForProvider(norm);
  if (saved) return saved;

  const current = readYulaClientAiConfig();
  if (current.provider?.toLowerCase() === norm && current.endpoint) {
    return current.endpoint;
  }

  return PROVIDER_DEFAULTS[norm]?.endpoint ?? "http://127.0.0.1:11434";
}

function ProviderFormContent({
  targetProvider,
  closeDialog,
  isTr,
}: {
  targetProvider: string;
  closeDialog: () => void;
  isTr: boolean;
}) {
  const currentConfig = readYulaClientAiConfig();
  const initialProv = React.useMemo(() => {
    return (targetProvider || currentConfig.provider || "azure").toLowerCase() as AIProviderType;
  }, [targetProvider, currentConfig.provider]);

  const [provider, setProvider] = React.useState<AIProviderType>(initialProv);
  const [endpoint, setEndpoint] = React.useState(() => resolveProviderEndpoint(initialProv));
  const [apiKey, setApiKey] = React.useState(() => getClientSecretForProvider(initialProv) || "");
  const [showKey, setShowKey] = React.useState(false);

  const loggedIn = isProviderLoggedIn(provider);
  const isActive = (currentConfig.provider || "").toLowerCase() === provider.toLowerCase();

  const handleProviderChange = (newProv: AIProviderType) => {
    setProvider(newProv);
    setEndpoint(resolveProviderEndpoint(newProv));
    setApiKey(getClientSecretForProvider(newProv) || "");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEndpoint = endpoint.trim();

    unmarkProviderLoggedOut(provider);
    saveEndpointForProvider(provider, cleanEndpoint);

    if (apiKey.trim()) {
      saveClientSecretForProvider(provider, apiKey.trim());
    }

    writeYulaClientAiConfig({
      provider,
      endpoint: cleanEndpoint,
      model: "",
    });

    useChatsStore.getState().setModel("");
    closeDialog();
  };

  const handleLogout = () => {
    markProviderLoggedOut(provider);
    deleteClientSecretForProvider(provider);

    if (isActive) {
      const remaining = getCachedAvailableProviders().filter(
        (p) => p.id.toLowerCase() !== provider.toLowerCase(),
      );
      const nextProv = (remaining[0]?.id || "ollama") as AIProviderType;
      writeYulaClientAiConfig({
        provider: nextProv,
        endpoint: resolveProviderEndpoint(nextProv),
        model: "",
      });
      useChatsStore.getState().setModel("");
    }

    closeDialog();
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 py-1">
      <div className="flex items-center justify-between gap-2 pb-0.5">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          {isTr ? "Durum:" : "Status:"}
        </span>
        {isActive ? (
          <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            {isTr ? "● Aktif Sağlayıcı" : "● Active Provider"}
          </span>
        ) : loggedIn ? (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {isTr ? "● Giriş Yapıldı" : "● Logged In"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            {isTr ? "Giriş Gerekli" : "Login Required"}
          </span>
        )}
      </div>

      <Field>
        <FieldLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Server className="size-3.5 text-primary" />
          {isTr ? "Sağlayıcı (Provider)" : "Provider"}
        </FieldLabel>
        <Select
          value={provider}
          onValueChange={(val: AIProviderType) => handleProviderChange(val)}
        >
          <SelectTrigger className="h-9 text-xs font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="azure">Microsoft Foundry (Azure OpenAI)</SelectItem>
            <SelectItem value="ollama">Ollama (Yerel / LAN)</SelectItem>
            <SelectItem value="openai">OpenAI / Uyumlu API</SelectItem>
            <SelectItem value="agnes">Agnes AI Gateway</SelectItem>
            <SelectItem value="nvidia">NVIDIA NIM</SelectItem>
            <SelectItem value="openrouter">OpenRouter</SelectItem>
            <SelectItem value="opencode">OpenCode</SelectItem>
            <SelectItem value="google">Google AI Studio</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Globe className="size-3.5 text-primary" />
          {isTr ? "Uç Nokta Adresi (Endpoint URL)" : "Endpoint URL"}
        </FieldLabel>
        <Input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={PROVIDER_DEFAULTS[provider]?.endpoint || "http://127.0.0.1:11434"}
          className="h-9 text-xs font-mono"
          required
        />
      </Field>

      <Field>
        <FieldLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Key className="size-3.5 text-primary" />
          {isTr ? "API Anahtarı / Token" : "API Key / Token"}
        </FieldLabel>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              loggedIn && !apiKey
                ? isTr
                  ? "•••••••• (Sistem anahtarı ile bağlı)"
                  : "•••••••• (Connected via system auth)"
                : provider === "ollama"
                  ? isTr
                    ? "Yerel Ollama için opsiyonel"
                    : "Optional for local Ollama"
                  : "sk-..."
            }
            className="h-9 text-xs font-mono pr-8"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Toggle password visibility"
          >
            {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <DialogFooter className="pt-2 sm:justify-between items-center gap-2">
        {loggedIn ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="text-xs h-8 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive gap-1.5 cursor-pointer"
            title={isTr ? "Bu sağlayıcıdan çıkış yap" : "Log out from this provider"}
          >
            <LogOut className="size-3.5" />
            <span>{isTr ? "Çıkış Yap" : "Logout"}</span>
          </Button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={closeDialog}
            className="text-xs h-8 cursor-pointer"
          >
            {isTr ? "İptal" : "Cancel"}
          </Button>
          <Button
            type="submit"
            size="sm"
            className="text-xs h-8 bg-gradient-to-r from-primary to-orange-500 text-primary-foreground hover:from-primary/90 hover:to-orange-500/90 cursor-pointer"
          >
            {isTr ? (isActive ? "Kaydet & Güncelle" : "Kaydet & Bağlan") : "Save & Connect"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

export function YulaProviderDialog() {
  const { isOpen, targetProvider, closeDialog } = useProviderDialogStore();
  const locale = useLocale();
  const isTr = locale === "tr";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-primary" />
            <DialogTitle className="text-base font-semibold">
              {isTr ? "AI Sağlayıcısı ve Bağlantı Ayarları" : "AI Provider & Connection Settings"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {isTr
              ? "Sağlayıcının uç nokta adresini (URL) ve kimlik bilgilerini yapılandırın."
              : "Configure the AI provider endpoint URL and API credentials."}
          </DialogDescription>
        </DialogHeader>

        {isOpen ? (
          <ProviderFormContent
            key={`${targetProvider}-${isOpen}`}
            targetProvider={targetProvider}
            closeDialog={closeDialog}
            isTr={isTr}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
