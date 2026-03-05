/**
 * src/i18n/useTranslation.ts
 *
 * Provides the `useTranslation()` hook which returns a `t()` function for
 * looking up UI strings in the active locale's dictionary.
 *
 * Usage:
 * ```
 * const { t } = useTranslation();
 * <h1>{t('heading_title')}</h1>
 * <p>{t('watchlist_remove_aria', { district: 'काठमाडौं', constituency: '1' })}</p>
 * ```
 *
 * The `t()` function supports simple `{placeholder}` interpolation for
 * strings that contain dynamic segments (e.g. `"Leading: {party}"`).
 */

import { useMemo } from 'react';
import { useLanguage } from './LanguageContext';
import en, { type UiStrings, type UiStringKey } from './en';
import np from './np';

/** Map of locale codes to their string dictionaries. */
const dictionaries: Record<string, UiStrings> = {
  en,
  np,
};

type StringKey = UiStringKey;

/**
 * Interpolation helper.
 *
 * Replaces `{placeholder}` tokens in `template` with the corresponding
 * values from `params`.
 *
 * @example
 * interpolate('Leading: {party}', { party: 'UML' })
 * // → 'Leading: UML'
 */
function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

/**
 * useTranslation
 *
 * Returns a `t()` function bound to the currently active locale.
 *
 * - If the key exists in the active dictionary, it returns the translated
 *   string (with optional interpolation).
 * - If the key is missing (shouldn't happen if both dictionaries are
 *   kept in sync), it falls back to the English dictionary.
 * - If the key is missing from both, it returns the raw key as a last resort
 *   so the UI never shows `undefined`.
 */
export function useTranslation() {
  const { locale } = useLanguage();

  const t = useMemo(() => {
    const dict = dictionaries[locale] ?? en;

    return (
      key: StringKey,
      params?: Record<string, string | number>
    ): string => {
      // Try active locale first, fall back to English, then raw key
      const raw = dict[key] ?? en[key] ?? key;
      return interpolate(raw, params);
    };
  }, [locale]);

  return { t };
}
