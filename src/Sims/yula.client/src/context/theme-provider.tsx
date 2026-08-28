"use client";

import * as React from "react";

type Theme = "dark" | "light" | "system";

interface ThemeProviderContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
  systemTheme?: "dark" | "light";
  forcedTheme?: string;
  themes: string[];
}

const ThemeProviderContext = React.createContext<ThemeProviderContextType>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
  themes: ["light", "dark", "system"],
});

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  attribute = "class",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<"dark" | "light">("light");

  const setTheme = React.useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch {}
    },
    [storageKey],
  );

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as Theme | null;
      if (saved) setThemeState(saved);
    } catch {}
  }, [storageKey]);

  React.useEffect(() => {
    const root = document.documentElement;
    const isDark =
      theme === "dark" ||
      (theme === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const actualTheme = isDark ? "dark" : "light";
    setResolvedTheme(actualTheme);

    if (attribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(actualTheme);
    } else {
      root.setAttribute(attribute, actualTheme);
    }
  }, [theme, attribute]);

  return (
    <ThemeProviderContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        systemTheme: resolvedTheme,
        themes: ["light", "dark", "system"],
      }}
    >
      <ThemeHotkey />
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  return React.useContext(ThemeProviderContext);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key?.toLowerCase() !== "d") {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resolvedTheme, setTheme]);

  return null;
}
