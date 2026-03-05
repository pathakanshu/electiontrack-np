/**
 * src/i18n/getName.ts
 *
 * Utility for resolving bilingual entity names (candidates, districts,
 * provinces) based on the current locale.
 *
 * Most entities in the app carry both `name_en` (English, nullable) and
 * `name_np` (Nepali, always present). This helper picks the right one
 * based on the active locale and gracefully falls back when translations
 * are missing.
 *
 * Fallback strategy:
 *   1. If locale is 'en' and `name_en` is available → return `name_en`
 *   2. Otherwise → return `name_np` (always available from the API)
 *
 * This means switching to English only works for entities that have been
 * translated. Untranslated entities continue to show Nepali names, which
 * is the correct behaviour — better to show the real name in Devanagari
 * than nothing or a broken placeholder.
 *
 * Usage:
 * ```ts
 * import { useLanguage } from '../i18n';
 * import { getName } from '../i18n/getName';
 *
 * const { locale } = useLanguage();
 * const displayName = getName(candidate, locale);
 * ```
 */

import type { Locale } from './LanguageContext';

/**
 * Any entity that carries both name fields.
 *
 * This is intentionally loose — it matches `Candidate`, `Province`,
 * `District`, or any ad-hoc object with the same shape.
 */
export interface Bilingual {
  name_en: string | null;
  name_np: string;
}

/**
 * Resolve the display name for a bilingual entity.
 *
 * @param entity - An object with `name_en` and `name_np` fields.
 * @param locale - The currently active locale ('en' or 'np').
 * @returns The appropriate name string for the given locale.
 */
export function getName(entity: Bilingual, locale: Locale): string {
  if (locale === 'en' && entity.name_en) {
    return entity.name_en;
  }
  return entity.name_np;
}

/**
 * Resolve the display name from loose name fields (not an entity object).
 *
 * Useful when you have the two fields available separately (e.g. from
 * destructured properties or a raw data row) rather than as an object.
 *
 * @param nameEn  - The English name (may be null / undefined / empty).
 * @param nameNp  - The Nepali name (always present).
 * @param locale  - The currently active locale.
 * @returns The appropriate name string for the given locale.
 */
export function getNameFromFields(
  nameEn: string | null | undefined,
  nameNp: string,
  locale: Locale
): string {
  if (locale === 'en' && nameEn) {
    return nameEn;
  }
  return nameNp;
}
