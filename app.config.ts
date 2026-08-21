import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const env = {
  appName: "قرآن يتلى",
  appSlug: "quran-yutla",
  logoUrl: "/manus-storage/quran-yutla-icon_e99f8120.png",
  scheme: "quranyutla",
  iosBundleId: "space.manus.quranyutla",
  androidPackage: "space.manus.quranyutla",
};

const config: ExpoConfig = {
  name: env.appName, slug: env.appSlug, version: "1.0.0", orientation: "portrait", icon: "./assets/images/icon.png", scheme: env.scheme, userInterfaceStyle: "automatic", newArchEnabled: true,
  ios: { supportsTablet: true, bundleIdentifier: env.iosBundleId, infoPlist: { ITSAppUsesNonExemptEncryption: false, UIBackgroundModes: ["audio"] } },
  android: { adaptiveIcon: { backgroundColor: "#075E54", foregroundImage: "./assets/images/android-icon-foreground.png", backgroundImage: "./assets/images/android-icon-background.png", monochromeImage: "./assets/images/android-icon-monochrome.png" }, edgeToEdgeEnabled: true, predictiveBackGestureEnabled: false, package: env.androidPackage, permissions: ["POST_NOTIFICATIONS"] },
  web: { bundler: "metro", output: "static", favicon: "./assets/images/favicon.png" },
  plugins: ["expo-router", "expo-audio", ["expo-splash-screen", { image: "./assets/images/splash-icon.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#075E54", dark: { backgroundColor: "#101A18" } }], ["expo-build-properties", { android: { buildArchs: ["armeabi-v7a", "arm64-v8a"], minSdkVersion: 24 } }]],
  experiments: { typedRoutes: true, reactCompiler: true },
};
export default config;
