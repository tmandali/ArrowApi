import type { Style } from '@react-pdf/types';
import type React from 'react';

/** Table visual style variant. */
export type TableVariant =
  | 'line'
  | 'grid'
  | 'minimal'
  | 'striped'
  | 'compact'
  | 'bordered'
  | 'primary-header';

/**
 * Table container with visual style variants and optional zebra striping.
 * Props - `variant` | `zebraStripe` | `noWrap` | `children` | `style`
 * @see {@link TableProps}
 */
export interface TableProps {
  /** Custom styles to merge with component defaults */
  style?: Style;
  /** Content to render */
  children: React.ReactNode;
  /**
   * @default 'line'
   */
  variant?: TableVariant;
  /**
   * @default false
   */
  zebraStripe?: boolean;
  /**
   * @default false
   */
  noWrap?: boolean;
}

export interface TableSectionProps {
  /** Custom styles to merge with component defaults */
  style?: Style;
  /** Content to render */
  children: React.ReactNode;
}

/**
 * Table row with optional header, footer, and stripe states.
 * Props - `header` | `footer` | `stripe` | `variant` | `children` | `style`
 * @see {@link TableRowProps}
 */
export interface TableRowProps {
  /** Custom styles to merge with component defaults */
  style?: Style;
  /** Content to render */
  children: React.ReactNode;
  header?: boolean;
  footer?: boolean;
  stripe?: boolean;
  variant?: TableVariant;
}

/**
 * Table cell with alignment, fixed width, and header or footer text styling.
 * Props - `header` | `footer` | `align` | `width` | `variant` | `_last` | `children` | `style`
 * @see {@link TableCellProps}
 */
export interface TableCellProps {
  /** Custom styles to merge with component defaults */
  style?: Style;
  /** Content to render */
  children: React.ReactNode;
  header?: boolean;
  footer?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
  variant?: TableVariant;
  _last?: boolean;
}
