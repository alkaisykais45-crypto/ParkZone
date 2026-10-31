import { useColorScheme } from "react-native";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemePreference = "system" | "light" | "dark";

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceTranslucent: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primaryBtnBg: string;
  primaryBtnText: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  evGreen: string;
  evGreenText: string;
  evGreenSoft: string;
  evGreenBorder: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  arrowCircleBg: string;
  arrowCircleText: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  pillActiveBg: string;
  pillActiveText: string;
  pillInactiveBg: string;
  pillInactiveText: string;
  inputBg: string;
  inputBorder: string;
  iconColor: string;
  blurTint: "light" | "dark";
  navBg: string;
  navBorder: string;
}

const THEME_STORAGE_KEY = "@parkzone_theme_pref";
let currentPreference: ThemePreference = "light";
let hasLoadedPreference = false;
const preferenceListeners = new Set<(pref: ThemePreference) => void>();

function notifyThemeListeners(pref: ThemePreference) {
  currentPreference = pref;
  preferenceListeners.forEach((listener) => listener(pref));
}

export function useTheme(): ThemeColors & {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
} {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(currentPreference);

  useEffect(() => {
    const listener = (nextPref: ThemePreference) => {
      setPreference(nextPref);
    };
    preferenceListeners.add(listener);

    if (!hasLoadedPreference) {
      hasLoadedPreference = true;
      AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
        if (saved === "light" || saved === "dark" || saved === "system") {
          notifyThemeListeners(saved);
        } else {
          notifyThemeListeners("light");
        }
      });
    }

    return () => {
      preferenceListeners.delete(listener);
    };
  }, []);

  const setThemePreference = (pref: ThemePreference) => {
    notifyThemeListeners(pref);
    AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
  };

  // Light mode is the default unless explicitly set to 'dark' or 'system' with dark OS
  const isDark =
    preference === "dark"
      ? true
      : preference === "system"
        ? systemScheme === "dark"
        : false;

  if (isDark) {
    return {
      isDark: true,
      themePreference: preference,
      setThemePreference,
      background: "#000000",
      surface: "#121215",
      surfaceMuted: "#18181B",
      surfaceTranslucent: "rgba(20, 20, 24, 0.75)",
      border: "rgba(255, 255, 255, 0.12)",
      borderStrong: "rgba(255, 255, 255, 0.24)",
      text: "#FFFFFF",
      textSecondary: "#A1A1AA",
      textMuted: "#71717A",
      primaryBtnBg: "#FFFFFF",
      primaryBtnText: "#000000",
      accent: "#FFFFFF",
      accentText: "#000000",
      accentSoft: "rgba(255, 255, 255, 0.12)",
      evGreen: "#10B981",
      evGreenText: "#FFFFFF",
      evGreenSoft: "rgba(16, 185, 129, 0.15)",
      evGreenBorder: "rgba(16, 185, 129, 0.38)",
      danger: "#EF4444",
      dangerSoft: "rgba(239, 68, 68, 0.16)",
      overlay: "rgba(0, 0, 0, 0.75)",
      arrowCircleBg: "#000000",
      arrowCircleText: "#FFFFFF",
      cardBg: "rgba(20, 20, 24, 0.75)",
      cardBorder: "rgba(255, 255, 255, 0.14)",
      cardShadow: "#000000",
      pillActiveBg: "#FFFFFF",
      pillActiveText: "#000000",
      pillInactiveBg: "rgba(255, 255, 255, 0.08)",
      pillInactiveText: "#A1A1AA",
      inputBg: "rgba(255, 255, 255, 0.06)",
      inputBorder: "rgba(255, 255, 255, 0.16)",
      iconColor: "#FFFFFF",
      blurTint: "dark",
      navBg: "rgba(18, 18, 22, 0.92)",
      navBorder: "rgba(255, 255, 255, 0.16)",
    };
  }

  return {
    isDark: false,
    themePreference: preference,
    setThemePreference,
    background: "#F4F4F6",
    surface: "#FFFFFF",
    surfaceMuted: "#ECECEF",
    surfaceTranslucent: "#FFFFFF",
    border: "rgba(0, 0, 0, 0.07)",
    borderStrong: "rgba(0, 0, 0, 0.16)",
    text: "#09090B",
    textSecondary: "#71717A",
    textMuted: "#A1A1AA",
    primaryBtnBg: "#09090B",
    primaryBtnText: "#FFFFFF",
    accent: "#09090B",
    accentText: "#FFFFFF",
    accentSoft: "rgba(9, 9, 11, 0.07)",
    evGreen: "#10B981",
    evGreenText: "#FFFFFF",
    evGreenSoft: "#ECFDF5",
    evGreenBorder: "rgba(16, 185, 129, 0.32)",
    danger: "#EF4444",
    dangerSoft: "rgba(239, 68, 68, 0.09)",
    overlay: "rgba(9, 9, 11, 0.45)",
    arrowCircleBg: "#FFFFFF",
    arrowCircleText: "#09090B",
    cardBg: "#FFFFFF",
    cardBorder: "rgba(0, 0, 0, 0.06)",
    cardShadow: "rgba(0, 0, 0, 0.06)",
    pillActiveBg: "#09090B",
    pillActiveText: "#FFFFFF",
    pillInactiveBg: "#E4E4E7",
    pillInactiveText: "#52525B",
    inputBg: "#FFFFFF",
    inputBorder: "rgba(0, 0, 0, 0.10)",
    iconColor: "#09090B",
    blurTint: "light",
    navBg: "rgba(255, 255, 255, 0.92)",
    navBorder: "rgba(0, 0, 0, 0.08)",
  };
}
