import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import fr from './locales/fr.json';

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const;

export const supportedLanguages = Object.keys(resources) as Array<keyof typeof resources>;

export const FALLBACK_LANGUAGE = 'en';

/**
 * Picks the first device locale we actually ship, ignoring the region subtag
 * ("fr-CA" resolves to "fr"). Falls back to English rather than throwing when the
 * platform reports no locale at all — which it does in some test and CI runtimes.
 */
export function resolveDeviceLanguage(): string {
  let locales: ReturnType<typeof getLocales> = [];
  try {
    locales = getLocales();
  } catch {
    return FALLBACK_LANGUAGE;
  }

  for (const locale of locales) {
    const tag = locale?.languageCode ?? '';
    if ((supportedLanguages as readonly string[]).includes(tag)) return tag;
  }
  return FALLBACK_LANGUAGE;
}

/**
 * Initialises i18next once. Safe to call repeatedly — later calls are no-ops, so
 * screens and tests can both depend on it without ordering constraints.
 */
export function initI18n(language: string = resolveDeviceLanguage()): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: FALLBACK_LANGUAGE,
      // React already escapes rendered strings; double-escaping mangles apostrophes,
      // which French copy is full of ("l'eau", "d'émotion").
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  return i18n;
}

export default i18n;
