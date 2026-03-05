import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Supported locales for the application.
 *
 * - 'en' — English
 * - 'np' — Nepali (नेपाली)
 */
export type Locale = 'en' | 'np';

interface LanguageContextValue {
  /** The currently active locale. */
  locale: Locale;
  /** Toggle between English and Nepali. */
  toggleLocale: () => void;
  /** Set a specific locale directly. */
  setLocale: (locale: Locale) => void;
}

const STORAGE_KEY = 'electiontrack-locale';

/**
 * Read the persisted locale from localStorage, falling back to 'en'.
 */
function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'np') return stored;
  } catch {
    // localStorage unavailable — fall through
  }
  return 'en';
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * LanguageProvider
 *
 * Wrap this around the app (typically in main.tsx or App.tsx) to make the
 * current locale available to every component via `useLanguage()`.
 *
 * The selected locale is persisted in localStorage so it survives page
 * reloads.
 */
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // silently ignore
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'np' : 'en');
  }, [locale, setLocale]);

  return (
    <LanguageContext.Provider value={{ locale, toggleLocale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
};

/**
 * useLanguage
 *
 * Access the current locale and language-switching functions from any
 * component nested inside `<LanguageProvider>`.
 *
 * @example
 * ```
 * const { locale, toggleLocale } = useLanguage();
 * ```
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error(
      'useLanguage() must be used within a <LanguageProvider>. ' +
        'Wrap your app (or the relevant subtree) with <LanguageProvider>.'
    );
  }
  return ctx;
}
