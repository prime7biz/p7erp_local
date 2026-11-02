import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { bn } from "./locales/bn";
import { en } from "./locales/en";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "bn", label: "বাংলা" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "p7_lang";

function storedLanguage(): LanguageCode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, bn: { translation: bn } },
  lng: storedLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

if (typeof document !== "undefined") document.documentElement.lang = i18n.language;

export function setLanguage(code: LanguageCode) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* private mode: language still changes for this tab */
  }
  document.documentElement.lang = code;
  void i18n.changeLanguage(code);
}

export default i18n;
