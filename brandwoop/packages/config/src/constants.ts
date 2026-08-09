/**
 * Deployment constants that must stay identical across web, API and mobile.
 * Region values are Australian by contract (scope section 13) — changing them
 * is a data-residency decision, not a configuration tweak.
 */
export const DEPLOYMENT_REGION = {
  vercelFunctionRegion: "syd1",
  dataResidency: "AU",
} as const;

export const DEFAULT_TIMEZONE = "Australia/Sydney";

export const SUPPORTED_LOCALES = ["en-AU"] as const;
