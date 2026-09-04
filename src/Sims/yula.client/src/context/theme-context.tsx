"use client";

import * as React from "react";

export type Theme = "dark" | "light" | "system";

export interface ThemeProviderContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
  systemTheme?: "dark" | "light";
  forcedTheme?: string;
  themes: string[];
}

export const ThemeProviderContext = React.createContext<ThemeProviderContextType>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
  themes: ["light", "dark", "system"],
});

export function useTheme() {
  return React.useContext(ThemeProviderContext);
}
