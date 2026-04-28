"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "dark" | "storm" | "light";

export const THEMES: { value: Theme; label: string; tone: "dark" | "light" }[] = [
  { value: "dark", label: "Onyx", tone: "dark" },
  { value: "storm", label: "Storm", tone: "dark" },
  { value: "light", label: "Bone", tone: "light" },
];

const THEME_KEY = "voicestudio.theme";
const ACCENT_KEY = "voicestudio.accent";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  accentHue: number;
  setAccentHue: (next: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light" || stored === "storm") return stored;
  return "dark";
}

function readAccent(): number {
  if (typeof window === "undefined") return 70;
  const stored = window.localStorage.getItem(ACCENT_KEY);
  if (!stored) return 70;
  const value = Number(stored);
  return Number.isFinite(value) ? value : 70;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accentHue, setAccentHueState] = useState<number>(70);

  useEffect(() => {
    setThemeState(readTheme());
    setAccentHueState(readAccent());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const isLight = theme === "light";
    // Light theme uses a deeper, more saturated accent so primary buttons read clearly
    // against the warm-white canvas. Dark themes keep the brighter accent for contrast.
    const accentL = isLight ? 0.58 : 0.78;
    const accentC = isLight ? 0.18 : 0.16;
    const inkOnAccentL = isLight ? 0.98 : 0.16;
    const inkOnAccentC = isLight ? 0.01 : 0.04;
    const inkOnAccentH = isLight ? 80 : accentHue;
    root.style.setProperty("--accent-hue", String(accentHue));
    root.style.setProperty("--accent", `oklch(${accentL} ${accentC} ${accentHue})`);
    root.style.setProperty("--accent-soft", `oklch(${accentL} ${accentC} ${accentHue} / ${isLight ? 0.12 : 0.16})`);
    root.style.setProperty("--accent-edge", `oklch(${accentL} ${accentC} ${accentHue} / 0.45)`);
    root.style.setProperty("--accent-ink", `oklch(${isLight ? 0.18 : 0.18} ${isLight ? 0.04 : 0.04} ${accentHue})`);
    root.style.setProperty("--ink-on-accent", `oklch(${inkOnAccentL} ${inkOnAccentC} ${inkOnAccentH})`);
  }, [accentHue, theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, next);
    }
  }, []);

  const setAccentHue = useCallback((next: number) => {
    setAccentHueState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACCENT_KEY, String(next));
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, accentHue, setAccentHue }),
    [theme, setTheme, accentHue, setAccentHue],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useStudioTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark" as Theme,
      setTheme: () => {},
      accentHue: 70,
      setAccentHue: () => {},
    };
  }
  return ctx;
}
