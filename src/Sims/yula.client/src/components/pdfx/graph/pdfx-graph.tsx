import { Svg, Text as SvgText } from '@react-pdf/renderer';
import { Text as PDFText, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type React from 'react';
import { usePdfxTheme, useSafeMemo } from '../../../lib/pdfx-theme-context';
import { createGraphStyles } from './pdfx-graph.styles';
import type { GraphProps } from './pdfx-graph.types';
import {
  GRAPH_SAFE_WIDTHS,
  buildLayout,
  getDefaultPalette,
  getGraphWidth,
  normalizeData,
} from './pdfx-graph.utils';
import {
  Legend,
  renderBarChart,
  renderHorizontalBarChart,
  renderLineAreaChart,
  renderPieDonutChart,
} from './pdfx-chart-renderers';

/**
 * PdfGraph — renders bar, horizontal-bar, line, area, pie, and donut charts
 * natively inside react-pdf documents using SVG primitives.
 *
 * No external chart libraries are required or used — all rendering is done via
 * react-pdf's built-in SVG support (`<Svg>`, `<Rect>`, `<Path>`, `<Line>`, etc.).
 *
 * @example Bar chart
 * ```tsx
 * <PdfGraph
 *   variant="bar"
 *   title="Monthly Revenue"
 *   data={[
 *     { label: 'Jan', value: 42000 },
 *     { label: 'Feb', value: 38000 },
 *     { label: 'Mar', value: 55000 },
 *   ]}
 * />
 * ```
 *
 * @example Donut chart with center label
 * ```tsx
 * <PdfGraph
 *   variant="donut"
 *   data={[
 *     { label: 'Product A', value: 45 },
 *     { label: 'Product B', value: 30 },
 *     { label: 'Other', value: 25 },
 *   ]}
 *   centerLabel="$1.2M"
 * />
 * ```
 *
 * **Limitations (by design):**
 * - No interactivity (PDFs are static)
 * - No animations
 * - SVG Text inside charts uses SVG font attributes (not react-pdf StyleSheet fonts)
 * - For print PDFs use SVG-friendly fonts registered with Font.register()
 */
export function PdfGraph({
  variant = 'bar',
  data,
  title,
  subtitle,
  xLabel,
  yLabel,
  width: explicitWidth,
  height = 260,
  fullWidth = false,
  containerPadding = 0,
  wrapperPadding = 0,
  colors,
  showValues = false,
  showGrid = true,
  legend = 'bottom',
  centerLabel,
  showDots = true,
  smooth = false,
  yTicks: yTickCount = 5,
  noWrap = true,
  style,
}: GraphProps) {
  const theme = usePdfxTheme();
  const styles = useSafeMemo(() => createGraphStyles(theme), [theme]);
  const palette = colors ?? getDefaultPalette(theme);
  const series = normalizeData(data);

  const width = useSafeMemo(() => {
    if (fullWidth) return getGraphWidth(theme, { containerPadding, wrapperPadding });
    return explicitWidth ?? GRAPH_SAFE_WIDTHS.default;
  }, [fullWidth, explicitWidth, theme, containerPadding, wrapperPadding]);

  const isPieOrDonut = variant === 'pie' || variant === 'donut';
  const layout = buildLayout(series, width, height, isPieOrDonut, yTickCount);
  const { chartX, chartW } = layout;

  let chartContent: React.ReactNode = null;

  switch (variant) {
    case 'bar':
      chartContent = renderBarChart(series, layout, palette, showGrid, showValues, theme);
      break;
    case 'horizontal-bar':
      chartContent = renderHorizontalBarChart(series, layout, palette, showValues, theme);
      break;
    case 'line':
    case 'area':
      chartContent = renderLineAreaChart(
        series,
        layout,
        palette,
        showGrid,
        showValues,
        showDots,
        smooth,
        variant === 'area',
        theme
      );
      break;
    case 'pie':
      chartContent = renderPieDonutChart(series, layout, palette, undefined, false, theme);
      break;
    case 'donut':
      chartContent = renderPieDonutChart(series, layout, palette, centerLabel, true, theme);
      break;
  }

  const showLegend = legend !== 'none' && !isPieOrDonut;

  const containerStyles: Style[] = [styles.container];
  if (style) containerStyles.push(style);

  const content = (
    <View style={containerStyles}>
      {title && <PDFText style={styles.title}>{title}</PDFText>}
      {subtitle && <PDFText style={styles.subtitle}>{subtitle}</PDFText>}
      <View style={legend === 'right' ? styles.chartWithRightLegend : undefined}>
        <Svg width={width} height={height}>
          {chartContent}
          {!isPieOrDonut && xLabel && (
            <SvgText
              x={chartX + chartW / 2}
              y={height - 2}
              fill={theme.colors.mutedForeground}
              textAnchor="middle"
              style={{ fontSize: 8 }}
            >
              {xLabel}
            </SvgText>
          )}
          {!isPieOrDonut && yLabel && (
            <SvgText
              x={2}
              y={10}
              fill={theme.colors.mutedForeground}
              textAnchor="start"
              style={{ fontSize: 8 }}
            >
              {yLabel}
            </SvgText>
          )}
        </Svg>
        {showLegend && legend === 'right' && Legend({ series, palette, styles, position: 'right' })}
      </View>
      {showLegend && legend === 'bottom' && Legend({ series, palette, styles, position: 'bottom' })}
    </View>
  );

  return noWrap ? <View wrap={false}>{content}</View> : content;
}
