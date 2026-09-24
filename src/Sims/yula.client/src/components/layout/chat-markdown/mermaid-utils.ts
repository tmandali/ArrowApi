/**
 * Utility helpers for Mermaid diagram SVG parsing and dimension calculation.
 */

export interface SvgDimensions {
  width: number;
  height: number;
}

export const DARK_THEME_VARS = {
  darkMode: true,
  background: "#18181b",
  primaryColor: "#ea580c",
  primaryTextColor: "#f4f4f5",
  primaryBorderColor: "#52525b",
  lineColor: "#a1a1aa",
  secondaryColor: "#27272a",
  tertiaryColor: "#18181b",
};

export const LIGHT_THEME_VARS = { darkMode: false, primaryColor: "#ea580c", lineColor: "#71717a" };

export function getSvgDimensions(svgContent: string): SvgDimensions {
  if (!svgContent) return { width: 800, height: 500 };
  const vbMatch = svgContent.match(/viewBox=["']\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s*["']/i);
  if (vbMatch) {
    const w = parseFloat(vbMatch[3]);
    const h = parseFloat(vbMatch[4]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  const wMatch = svgContent.match(/width=["']([0-9.-]+)(?:px)?["']/i);
  const hMatch = svgContent.match(/height=["']([0-9.-]+)(?:px)?["']/i);
  if (wMatch && hMatch) {
    const w = parseFloat(wMatch[1]);
    const h = parseFloat(hMatch[1]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  return { width: 800, height: 500 };
}
