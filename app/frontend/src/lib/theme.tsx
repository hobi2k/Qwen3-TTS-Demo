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
export type Density = "compact" | "normal" | "spacious";

export const THEMES: { value: Theme; label: string; tone: "dark" | "light" }[] = [
  { value: "dark", label: "Onyx", tone: "dark" },
  { value: "storm", label: "Storm", tone: "dark" },
  { value: "light", label: "Bone", tone: "light" },
];

export const DENSITIES: Density[] = ["compact", "normal", "spacious"];

const THEME_KEY = "voicestudio.theme";
const DENSITY_KEY = "voicestudio.density";
const ACCENT_KEY = "voicestudio.accent";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  density: Density;
  setDensity: (next: Density) => void;
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

function readDensity(): Density {
  if (typeof window === "undefined") return "normal";
  const stored = window.localStorage.getItem(DENSITY_KEY);
  if (stored === "compact" || stored === "normal" || stored === "spacious") return stored;
  return "normal";
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
  const [density, setDensityState] = useState<Density>("normal");
  const [accentHue, setAccentHueState] = useState<number>(70);

  useEffect(() => {
    setThemeState(readTheme());
    setDensityState(readDensity());
    setAccentHueState(readAccent());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--accent-hue", String(accentHue));
    root.style.setProperty("--accent", `oklch(0.78 0.16 ${accentHue})`);
    root.style.setProperty("--accent-soft", `oklch(0.78 0.16 ${accentHue} / 0.16)`);
    root.style.setProperty("--accent-edge", `oklch(0.78 0.16 ${accentHue} / 0.45)`);
    root.style.setProperty("--accent-ink", `oklch(0.18 0.04 ${accentHue})`);
  }, [accentHue]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, next);
    }
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DENSITY_KEY, next);
    }
  }, []);

  const setAccentHue = useCallback((next: number) => {
    setAccentHueState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACCENT_KEY, String(next));
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, density, setDensity, accentHue, setAccentHue }),
    [theme, setTheme, density, setDensity, accentHue, setAccentHue],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useStudioTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark" as Theme,
      setTheme: () => {},
      density: "normal" as Density,
      setDensity: () => {},
      accentHue: 70,
      setAccentHue: () => {},
    };
  }
  return ctx;
}
