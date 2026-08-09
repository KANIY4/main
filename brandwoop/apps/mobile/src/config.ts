import Constants from "expo-constants";

interface MobileExtra {
  readonly apiBaseUrl?: string;
  readonly appEnv?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as MobileExtra;

export const apiBaseUrl = extra.apiBaseUrl ?? "http://localhost:3000";
export const appEnv = extra.appEnv ?? "development";

/**
 * Session tokens live in the platform secure store, never in AsyncStorage,
 * logs or analytics (scope section 10). The secure-storage adapter arrives with
 * authentication in the week 1-2 foundation work.
 */
export const SECURE_STORE_SESSION_KEY = "brandwoop.session";
