import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage, type LanguageCode } from "./index";

/** Small English / বাংলা switch. Remembered on this device. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n, t } = useTranslation();
  return (
    <label className={`inline-flex items-center gap-1 text-xs text-text-secondary ${className}`}>
      <Languages className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={i18n.language === "bn" ? "bn" : "en"}
        onChange={(e) => setLanguage(e.target.value as LanguageCode)}
        className="rounded-md border border-border-strong bg-surface-base px-1.5 py-0.5 text-xs"
        aria-label={t("common.language")}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
