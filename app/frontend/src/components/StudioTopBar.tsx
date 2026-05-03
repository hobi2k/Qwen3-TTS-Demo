"use client";

import { AudioLines, Check, Globe, Moon, Palette, Sun, SunMoon } from "lucide-react";
import { LOCALES, useTranslation } from "../lib/i18n";
import { THEMES, Theme, useStudioTheme } from "../lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface StudioTopBarProps {
  title?: string;
}

const THEME_ICON: Record<Theme, typeof Moon> = {
  light: Sun,
  dark: Moon,
  storm: SunMoon,
};

export function StudioTopBar({ title = "Voice Studio" }: StudioTopBarProps) {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme, accentHue, setAccentHue } = useStudioTheme();
  const ThemeIcon = THEME_ICON[theme];
  const activeLocale = LOCALES.find((option) => option.value === locale);

  return (
    <header className="sticky top-0 z-30 flex h-[var(--shell-topbar-h)] items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-canvas/65">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-md bg-accent text-ink-on-accent shadow-[0_0_0_1px_var(--accent-edge)]">
          <AudioLines className="size-4" />
        </div>
        <div className="flex min-w-0 flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-ink">{t("brand.name")}</span>
          <span className="truncate text-[11px] text-ink-muted">{title}</span>
        </div>
      </div>

      <div className="flex-1" />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-ink-muted hover:text-ink"
            aria-label={t("topbar.accent", "Accent color")}
            title={t("topbar.accent", "Accent color")}
          >
            <Palette className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">
                {t("topbar.accent", "Accent color")}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-ink-subtle">{accentHue}°</span>
            </div>
            <Slider
              value={[accentHue]}
              onValueChange={(value) => setAccentHue(value[0] ?? 70)}
              min={0}
              max={360}
              step={1}
              aria-label={t("topbar.accent", "Accent color")}
            />
            <div className="flex items-center justify-between gap-2">
              <span
                className="grid h-6 flex-1 place-items-center rounded-md text-[10px] font-medium uppercase tracking-allcaps"
                style={{
                  background: "var(--accent)",
                  color: "var(--ink-on-accent)",
                }}
              >
                Primary
              </span>
              <span
                className="grid h-6 flex-1 place-items-center rounded-md text-[10px] font-medium text-accent-ink"
                style={{ background: "var(--accent-soft)" }}
              >
                Soft
              </span>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-ink-muted hover:text-ink"
            aria-label={t("topbar.theme")}
            title={t("topbar.theme")}
          >
            <ThemeIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-allcaps text-ink-subtle">
            {t("topbar.theme")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
            {THEMES.map((option) => {
              const Icon = THEME_ICON[option.value];
              return (
                <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2">
                  <Icon className="size-3.5 text-ink-muted" />
                  <span className="flex-1">{t(`theme.${option.value}`, option.label)}</span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-ink-muted hover:text-ink"
            aria-label={t("topbar.language")}
            title={t("topbar.language")}
          >
            <Globe className="size-4" />
            <span className="text-xs font-medium">
              {activeLocale?.value.toUpperCase() ?? "KO"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-allcaps text-ink-subtle">
            {t("topbar.language")}
          </DropdownMenuLabel>
          {LOCALES.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setLocale(option.value)}
              className="gap-2"
            >
              <span className="flex-1">
                <span className="block text-sm font-medium">{option.native}</span>
                <span className="block text-[10px] uppercase tracking-wide text-ink-subtle">
                  {option.label}
                </span>
              </span>
              {locale === option.value ? (
                <Check className="size-3.5 text-accent" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
