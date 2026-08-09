import type { ExpoConfig } from "expo/config";

/**
 * Application identity is a release decision, not a code default.
 *
 * D-04 (docs/decisions.md) must be confirmed before the first signed build:
 * the identifiers below are placeholders and the production profile refuses to
 * build until BRANDWOOP_ANDROID_PACKAGE is set in the EAS environment.
 */
const androidPackage = process.env.BRANDWOOP_ANDROID_PACKAGE ?? "au.com.brandwoop.app.placeholder";
const iosBundleIdentifier =
  process.env.BRANDWOOP_IOS_BUNDLE_ID ?? "au.com.brandwoop.app.placeholder";

if (process.env.EAS_BUILD_PROFILE === "production" && androidPackage.endsWith(".placeholder")) {
  throw new Error(
    "BRANDWOOP_ANDROID_PACKAGE must be set for a production build (decision D-04 pending)",
  );
}

const config: ExpoConfig = {
  name: "BrandWoop",
  slug: "brandwoop",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "brandwoop",
  userInterfaceStyle: "automatic",
  assetBundlePatterns: ["**/*"],
  android: {
    package: androidPackage,
    versionCode: 1,
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.POST_NOTIFICATIONS",
    ],
    // Background location is deliberately absent: attendance captures a single
    // fix at defined actions and there is no continuous tracking in phases 1-2.
  },
  ios: {
    bundleIdentifier: iosBundleIdentifier,
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        "BrandWoop uses the camera to attach before and after cleaning evidence to your shift.",
      NSLocationWhenInUseUsageDescription:
        "BrandWoop records your location once when you sign in or out of a shift to confirm you are at the site. It does not track you between those actions.",
      NSPhotoLibraryAddUsageDescription:
        "BrandWoop saves cleaning evidence photos you capture in the app.",
    },
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  },
};

export default config;
