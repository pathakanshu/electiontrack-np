/**
 * src/i18n/index.ts
 *
 * Barrel export for the i18n module.
 *
 * Import everything from here instead of reaching into individual files:
 *
 * ```ts
 * import { LanguageProvider, useLanguage, useTranslation } from '../i18n';
 * import type { Locale, UiStrings } from '../i18n';
 * ```
 */

export { LanguageProvider, useLanguage } from './LanguageContext';
export type { Locale } from './LanguageContext';

export { useTranslation } from './useTranslation';

export type { UiStrings, UiStringKey } from './en';
