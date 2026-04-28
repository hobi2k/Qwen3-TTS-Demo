"use client";

import { LOCALES, useTranslation } from "../lib/i18n";
import { THEMES, useStudioTheme } from "../lib/theme";

interface StudioTopBarProps {
  onRender?: () => void;
  onShare?: () => void;
  renderDisabled?: boolean;
  title?: string;
}

export function StudioTopBar({ onRender, onShare, renderDisabled = false, title = "Voice Studio" }: StudioTopBarProps) {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useStudioTheme();

  return (
    <header className="studio-topbar">
      <div className="studio-topbar__brand">
        <div className="studio-topbar__brand-mark" aria-hidden />
        <div className="studio-topbar__brand-name">
          <strong>{t("brand.name")}</strong>
          <span>{title}</span>
        </div>
      </div>

      <div className="studio-topbar__page-title" aria-label="현재 화면">
        {title}
      </div>

      <div className="studio-topbar__spacer" />

      <div className="studio-topbar__group" role="radiogroup" aria-label={t("topbar.theme")}>
        {THEMES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={theme === option.value ? "is-on" : ""}
            onClick={() => setTheme(option.value)}
            aria-pressed={theme === option.value}
          >
            {t(`theme.short.${option.value}`, option.label)}
          </button>
        ))}
      </div>

      <select
        className="studio-topbar__select"
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
        aria-label={t("topbar.language")}
      >
        {LOCALES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.native}
          </option>
        ))}
      </select>

      {onShare ? (
        <button className="studio-topbar__share" onClick={onShare} type="button">
          {t("action.copyLink")}
        </button>
      ) : null}
      {onRender ? (
        <button className="studio-topbar__render" disabled={renderDisabled} onClick={onRender} type="button">
          ▶ {t("action.runCurrent")}
        </button>
      ) : null}
    </header>
  );
}
