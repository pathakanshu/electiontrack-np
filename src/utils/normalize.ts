/**
 * src/utils/normalize.ts
 *
 * Utility functions for normalizing text to handle inconsistent whitespace
 * and other common variations in Nepali names and text.
 *
 * This is especially important for looking up names in translation maps where
 * the data might have extra spaces, multiple spaces, or inconsistent spacing.
 */

/**
 * Normalize whitespace in a string.
 * - Trims leading/trailing whitespace
 * - Collapses multiple consecutive spaces into single spaces
 * - Handles various Unicode whitespace characters
 *
 * @param text - The text to normalize
 * @returns Normalized text with consistent spacing
 *
 * @example
 * normalizeWhitespace("प्रबल  थापा क्षेत्री ") // "प्रबल थापा क्षेत्री"
 * normalizeWhitespace("नेपाली   काँग्रेस") // "नेपाली काँग्रेस"
 */
export function normalizeWhitespace(text: string): string {
  if (!text) return text;

  return text
    .trim() // Remove leading/trailing whitespace
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

/**
 * Normalize a name for lookup/matching purposes.
 * Applies whitespace normalization and can be extended for other normalizations.
 *
 * @param name - The name to normalize
 * @returns Normalized name suitable for lookups
 *
 * @example
 * normalizeName("प्रबल  थापा क्षेत्री ") // "प्रबल थापा क्षेत्री"
 */
export function normalizeName(name: string): string {
  return normalizeWhitespace(name);
}

/**
 * Create a normalized version of a lookup map.
 * Takes a map with potentially inconsistent whitespace in keys
 * and returns a new map with normalized keys.
 *
 * @param map - The original map
 * @returns New map with normalized keys
 *
 * @example
 * const original = { "प्रबल  थापा": "Prabal Thapa" };
 * const normalized = normalizeMapKeys(original);
 * // normalized["प्रबल थापा"] === "Prabal Thapa"
 */
export function normalizeMapKeys<T>(map: Record<string, T>): Record<string, T> {
  const normalized: Record<string, T> = {};

  for (const [key, value] of Object.entries(map)) {
    const normalizedKey = normalizeWhitespace(key);
    normalized[normalizedKey] = value;
  }

  return normalized;
}

/**
 * Look up a value in a map with normalized key matching.
 * Normalizes the lookup key to handle whitespace variations.
 *
 * @param map - The lookup map
 * @param key - The key to look up (may have inconsistent whitespace)
 * @returns The value if found, undefined otherwise
 *
 * @example
 * const translations = { "प्रबल थापा": "Prabal Thapa" };
 * normalizedLookup(translations, "प्रबल  थापा") // "Prabal Thapa"
 */
export function normalizedLookup<T>(
  map: Record<string, T>,
  key: string
): T | undefined {
  const normalizedKey = normalizeWhitespace(key);
  return map[normalizedKey];
}
