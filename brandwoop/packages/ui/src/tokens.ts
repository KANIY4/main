/**
 * Brand tokens shared by the portal and the mobile app.
 *
 * Final brand values are a BrandWoop input (scope section 18.2). The contrast
 * ratios noted below are measured against the paired surface and must be
 * re-checked when the real palette arrives — WCAG 2.2 AA is 4.5:1 for body
 * text and 3:1 for large text and focus indicators.
 */

export const colours = {
  surface: "#ffffff",
  surfaceDark: "#10141a",
  text: "#14181f", // 15.8:1 on surface
  textMuted: "#4a5364", // 7.9:1 on surface
  accent: "#12507a", // 8.1:1 on surface
  accentDark: "#7ab8e6", // 8.4:1 on surfaceDark
  success: "#1f6b3a",
  warning: "#8a5300",
  danger: "#a01d1d",
} as const;

export type ColourToken = keyof typeof colours;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  bodySize: 16,
  headingSize: 28,
  lineHeight: 1.5,
} as const;

/** WCAG 2.2 target size minimum for touch controls. */
export const touchTarget = { minimumPx: 44 } as const;
